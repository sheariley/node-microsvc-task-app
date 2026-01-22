export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import {
  coalesceErrorMsg,
  getServerConfig,
  HttpError,
  httpResponseHasBody,
} from 'ms-task-app-common'
import { createMtlsFetcher } from 'ms-task-app-mtls'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  createGatewayServiceResolver,
  excludeHopByHopHeaders,
  setXForwardedHeaders,
} from '@/lib/api-routing'
import { serviceRoutes } from './service-routes'
import serverLogger from '@/lib/logging/server-logger'

let _fetch: (url: string, requestInit: RequestInit) => Promise<Response> = fetch

const serverEnv = getServerConfig()

if (!serverEnv.disableInternalMtls) {
  const mtlsFetcher = createMtlsFetcher({
    keyPath: serverEnv.webUi.privateKeyPath,
    certPath: serverEnv.webUi.certPath,
    caPath: serverEnv.webUi.caCertPath,
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
    serverLogger.info({ from: forwardPath || '/', to: resolved.target }, 'API gateway route matched')
    targetBase = resolved.target
  } catch (err) {
    const message = coalesceErrorMsg(err, 'Internal gateway routing error')
    const status = err instanceof HttpError ? err.status : 500
    return NextResponse.json({ error: true, message }, { status })
  }

  const targetUri = `${targetBase}${urlObj.search}`
  const nextHeaders = await headers()
  const outHeaders = setXForwardedHeaders(urlObj, excludeHopByHopHeaders(nextHeaders))

  let body: ArrayBuffer | undefined = undefined
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      body = await req.arrayBuffer()
    } catch {
      // TODO: Determine if we should handle this better to improve observability (logging, etc...)
      body = undefined
    }
  }

  try {
    let serviceResponse: Response | undefined
    try {
      serviceResponse = await _fetch(targetUri, {
        method: req.method,
        headers: outHeaders,
        body: body && body.byteLength ? body : undefined,
        redirect: 'manual',
      })
    } catch (cause) {
      throw new HttpError('Service unreachable', 503, { cause })
    }

    const respHeaders = excludeHopByHopHeaders(serviceResponse.headers)

    const respArrayBuffer =
      !serviceResponse.body || !httpResponseHasBody(serviceResponse.status, req.method)
        ? null
        : await serviceResponse.arrayBuffer()

    return new NextResponse(respArrayBuffer, {
      status: serviceResponse.status,
      headers: respHeaders,
    })
  } catch (err) {
    const message = coalesceErrorMsg(err, 'Internal Server Error')
    const status = err instanceof HttpError ? err.status : 500
    return NextResponse.json({ error: true, message }, { status })
  }
})

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
export const PATCH = proxyRequest
export const OPTIONS = proxyRequest
export const HEAD = proxyRequest
