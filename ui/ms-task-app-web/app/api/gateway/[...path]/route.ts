export const runtime = 'nodejs'

import { auth } from '@/auth'
import { createGatewayServiceResolver, excludeHopByHopHeaders, setXForwardedHeaders } from '@/lib/api-routing'
import { coalesceErrorMsg, HttpError } from 'ms-task-app-common'
import { NextResponse } from 'next/server'
import { createMtlsFetcher } from 'ms-task-app-auth'
import { serviceRoutes } from './service-routes'

let _fetch: (url: string, requestInit: RequestInit) => Promise<Response> = fetch

const disableInternalMtls = process.env.DISABLE_INTERNAL_MTLS === 'true'
if (!disableInternalMtls) {
  const mtlsFetcher = createMtlsFetcher({
    keyPath: '../../.certs/web-ui/web-ui.key.pem',
    certPath: '../../.certs/web-ui/web-ui.cert.pem',
    caPath: '../../.certs/ca/ca.cert.pem',
  })
  _fetch = mtlsFetcher.fetch
}

const gatewaySvcResolver = createGatewayServiceResolver({ routes: serviceRoutes })

const proxyRequest = auth(async req => {
  if (!req.auth) {
    return NextResponse.json({ error: true, message: 'Unauthorized' }, { status: 401 })
  }

  const urlObj = new URL(req.url)
  const prefix = '/api/gateway'
  const forwardPath = urlObj.pathname.startsWith(prefix)
    ? urlObj.pathname.slice(prefix.length)
    : urlObj.pathname

  let targetBase: string
  try {
    const resolved = await gatewaySvcResolver.resolve(forwardPath || '/', req)
    console.info('API gateway route matched', { from: forwardPath || '/', to: resolved.target })
    targetBase = resolved.target
  } catch (err) {
    const message = coalesceErrorMsg(err, 'Internal gateway routing error')
    const status = err instanceof HttpError ? err.status : 500
    return NextResponse.json({ error: true, message }, { status })
  }

  const targetUri = `${targetBase}${urlObj.search}`
  const outHeaders = setXForwardedHeaders(urlObj, excludeHopByHopHeaders(req.headers))

  let body: ArrayBuffer | undefined = undefined
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      body = await req.arrayBuffer()
    } catch {
      // TODO: Determine if we should handle this better to improve observability (logging, etc...)
      body = undefined
    }
  }

  const serviceResponse = await _fetch(targetUri, {
    method: req.method,
    headers: outHeaders,
    body: body && body.byteLength ? body : undefined,
    redirect: 'manual',
  })

  const respHeaders = excludeHopByHopHeaders(serviceResponse.headers)
  const respArrayBuffer = await serviceResponse.arrayBuffer()

  return new NextResponse(respArrayBuffer, {
    status: serviceResponse.status,
    headers: respHeaders,
  })
})

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
export const PATCH = proxyRequest
export const OPTIONS = proxyRequest
export const HEAD = proxyRequest
