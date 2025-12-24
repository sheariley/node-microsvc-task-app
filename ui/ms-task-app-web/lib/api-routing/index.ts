import { HttpError } from 'ms-task-app-common'
import { NextRequest } from 'next/server'

type PredicateRouteMatcher = (path: string, req: NextRequest) => boolean | Promise<boolean>
type Matcher = RegExp | PredicateRouteMatcher
// Service must be a fully assembled taget URL string (e.g. 'http://svc:3000/users/123')
// or a resolver function that returns such a URL string.
type ServiceDef = string | ((path: string, req: NextRequest) => string | Promise<string>)
type RouteEntry = { matcher: Matcher; service: ServiceDef; name?: string }

export type MatchedRoute = {
  // full target URL base including the matched path (e.g. 'http://svc:3000/users/123')
  target: string
  routeName?: string
}

const apiRouteTable: RouteEntry[] = [
  {
    name: 'task-service',
    // matches: /users/:userId/tasks or deeper, e.g. /users/123/tasks, /users/123/tasks/456
    matcher: /^\/users(?:\/[^\/]+)?\/tasks(?:\/|$)/,
    // Route entry is responsible for returning the full target URL. Use a
    // resolver here to assemble a full URL using the configured host/port
    // and the incoming path. This makes it possible to map gateway paths to
    // different backend target paths when needed.
    service: (path: string) => {
      const base = buildBaseFromHostPort(
        process.env.TASK_SVC_HOST ?? 'task-service',
        Number(process.env.TASK_SVC_PORT ?? 3002)
      )
      return `${base}${path}`
    },
  },
  {
    name: 'user-service',
    // matches: /users or /users/:id
    matcher: /^\/users(?:\/|$)/,
    service: (path: string) => {
      const base = buildBaseFromHostPort(
        process.env.USER_SVC_HOST ?? 'user-service',
        Number(process.env.USER_SVC_PORT ?? 3001)
      )
      return `${base}${path}`
    },
  },
]

function buildBaseFromHostPort(host: string, port: number) {
  return host.startsWith('http://') || host.startsWith('https://')
    ? `${host}:${port}`
    : `http://${host}:${port}`
}

export async function matchAndResolveServiceBase(
  path: string,
  req: NextRequest
): Promise<MatchedRoute> {
  const normalizedPath = !path ? '/' : path.startsWith('/') ? path : `/${path}`

  let matched: RouteEntry | undefined
  for (const entry of apiRouteTable) {
    if (entry.matcher instanceof RegExp) {
      if (entry.matcher.test(normalizedPath)) {
        matched = entry
        break
      }
    } else {
      try {
        if (await entry.matcher(normalizedPath, req)) {
          matched = entry
          break
        }
      } catch {
        // ignore predicate errors
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

export { apiRouteTable as routeTable }
