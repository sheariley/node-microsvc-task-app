import { HttpError } from 'ms-task-app-common'
import { NextRequest } from 'next/server'

export type PredicateRouteMatcher = (path: string, req: NextRequest) => boolean | Promise<boolean>
export type Matcher = RegExp | PredicateRouteMatcher
// Service must be a fully assembled taget URL string (e.g. 'http://svc:3000/users/123')
// or a resolver function that returns such a URL string.
export type ServiceDef = string | ((path: string, req: NextRequest) => string | Promise<string>)
export type RouteEntry = { matcher: Matcher; service: ServiceDef; name?: string }

export type MatchedRoute = {
  // full target URL base including the matched path (e.g. 'http://svc:3000/users/123')
  target: string
  routeName?: string
}

export type GatewayServiceResolverOptions = {
  routes: RouteEntry[]
}

export function createGatewayServiceResolver({ routes }: GatewayServiceResolverOptions) {
  async function resolve(path: string, req: NextRequest): Promise<MatchedRoute> {
    const normalizedPath = !path ? '/' : path.startsWith('/') ? path : `/${path}`

    let matched: RouteEntry | undefined
    for (const entry of routes) {
      if (entry.matcher instanceof RegExp) {
        if (entry.matcher.test(normalizedPath)) {
          matched = entry
          break
        }
      } else {
        if (await entry.matcher(normalizedPath, req)) {
          matched = entry
          break
        }
      }
    }

    if (!matched) throw new HttpError('No matching backend service for path', 400)

    if (typeof matched.service === 'function') {
      const url = await matched.service(normalizedPath, req)
      if (!url) throw new HttpError('Service resolver returned empty URL', 500)
      // resolver is expected to return the full target base including path
      return { target: url, routeName: matched.name }
    }

    // service is a string (fully assembled base URL such as 'http://svc:3000')
    const target = matched.service
    if (!target) throw new HttpError('Internal service not configured', 500)

    return { target, routeName: matched.name }
  }

  return { resolve }
}

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

/**
 * Filters out any headers that were declared as hop-by-hop in the Connection header.
 * The `Connection` header can list other header names that are only valid
 * for a single transport hop (e.g. `Connection: Keep-Alive, X-Local-Header`).
*/
export function excludeHopByHopHeaders(sourceHeaders: Headers) {
  const connectionHeader = sourceHeaders.get('connection') || sourceHeaders.get('Connection')
  const connectionHeaderNames = new Set<string>()
  if (connectionHeader) {
    connectionHeader
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(name => connectionHeaderNames.add(name))
  }

  const result = new Headers()

  sourceHeaders
    .entries()
    .filter(
      ([name]) =>
        name.toLowerCase() !== 'host' &&
        !HOP_BY_HOP.has(name.toLowerCase()) &&
        !connectionHeaderNames.has(name.toLowerCase())
    )
    .forEach(([name, value]) => result.set(name, value))

  return result
}

/**
 * Adds X-Forwarded headers to preserve client context when talking to backends.
 * Try to append to an existing X-Forwarded-For if present, otherwise use any
 * available client IP header (x-real-ip) or 'unknown'. Note: in many hosting
 * environments the actual client IP is set by the fronting proxy/load-balancer.
*/
export function setXForwardedHeaders(urlObj: URL, sourceHeaders: Headers) {
  const result = new Headers(sourceHeaders)
  
  const existingXff = sourceHeaders.get('x-forwarded-for') || ''
  const realIp = sourceHeaders.get('x-real-ip') || 'unknown'
  const xForwardedFor = existingXff ? `${existingXff}, ${realIp}` : realIp
  result.set('x-forwarded-for', xForwardedFor)
  result.set('x-forwarded-proto', urlObj.protocol.replace(':', ''))
  result.set('x-forwarded-host', sourceHeaders.get('host') || urlObj.hostname)

  return result
}
