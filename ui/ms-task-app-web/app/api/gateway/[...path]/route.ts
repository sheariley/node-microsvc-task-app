import { auth } from '@/auth'
import { matchAndResolveServiceBase } from '@/lib/api-routing'
import { coalesceErrorMsg, HttpError } from 'ms-task-app-common'
import { NextResponse } from 'next/server'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

const proxyRequest = auth(async (req) => {
  if (!req.auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const urlObj = new URL(req.url)
  const prefix = '/api/gateway'
  const forwardPath = urlObj.pathname.startsWith(prefix)
    ? urlObj.pathname.slice(prefix.length)
    : urlObj.pathname

  let targetBase: string
  try {
    const resolved = await matchAndResolveServiceBase(forwardPath || '/', req)
    console.info('API gateway route matched', { from: forwardPath || '/', to: resolved.target })
    targetBase = resolved.target
  } catch (err) {
    if (err instanceof HttpError)
      return NextResponse.json({ error: err.message }, { status: err.status })
    const message = coalesceErrorMsg(err, 'Internal gateway routing error')
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const targetUri = `${targetBase}${urlObj.search}`

  const outHeaders = new Headers(req.headers)
  outHeaders.delete('host')

  // Remove any headers that were declared as hop-by-hop in the Connection header.
  // The `Connection` header can list other header names that are only valid
  // for a single transport hop (e.g. `Connection: Keep-Alive, X-Local-Header`).
  const connectionHeader = outHeaders.get('connection') || outHeaders.get('Connection')
  if (connectionHeader) {
    connectionHeader
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(name => {
        outHeaders.delete(name)
      })
    // remove the Connection header itself
    outHeaders.delete('connection')
    outHeaders.delete('Connection')
  }

  // Remove standard hop-by-hop headers defined by RFC 7230.
  for (const h of HOP_BY_HOP) outHeaders.delete(h)

  // Add X-Forwarded headers to preserve client context when talking to backends.
  // Try to append to an existing X-Forwarded-For if present, otherwise use any
  // available client IP header (x-real-ip) or 'unknown'. Note: in many hosting
  // environments the actual client IP is set by the fronting proxy/load-balancer.
  const existingXff = req.headers.get('x-forwarded-for') || ''
  const realIp = req.headers.get('x-real-ip') || 'unknown'
  const xForwardedFor = existingXff ? `${existingXff}, ${realIp}` : realIp
  outHeaders.set('x-forwarded-for', xForwardedFor)
  outHeaders.set('x-forwarded-proto', urlObj.protocol.replace(':', ''))
  outHeaders.set('x-forwarded-host', req.headers.get('host') || urlObj.hostname)

  let body: ArrayBuffer | undefined = undefined
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      body = await req.arrayBuffer()
    } catch {
      body = undefined
    }
  }

  const forwarded = await fetch(targetUri, {
    method: req.method,
    headers: outHeaders,
    body: body && body.byteLength ? body : undefined,
    redirect: 'manual',
  })

  const respArrayBuffer = await forwarded.arrayBuffer()

  const respConnectionHeader =
    forwarded.headers.get('connection') || forwarded.headers.get('Connection')
  const respConHeaders = !respConnectionHeader
    ? []
    : respConnectionHeader
        ?.split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(x => x.toLowerCase())

  // Remove any headers from the response that were declared hop-by-hop in the
  // response's Connection header (mirror of request-side handling).
  const respHeaders = new Headers()
  forwarded.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && !respConHeaders.includes(key.toLowerCase()))
      respHeaders.set(key, value)
  })

  return new NextResponse(respArrayBuffer, {
    status: forwarded.status,
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
