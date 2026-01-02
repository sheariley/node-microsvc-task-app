import { RouteEntry } from '@/lib/api-routing'
import { getServiceBaseUrl } from 'ms-task-app-common'

const disableInternalMtls = process.env.DISABLE_INTERNAL_MTLS === 'true'
const taskServiceBaseUrl = getServiceBaseUrl({
  host: process.env.TASK_SVC_HOST ?? 'task-service',
  port: Number(process.env.TASK_SVC_PORT ?? 3002),
  secure: !disableInternalMtls,
})
const oauthServiceBaseUrl = getServiceBaseUrl({
  host: process.env.OAUTH_SVC_HOST ?? 'oauth-service',
  port: Number(process.env.OAUTH_SVC_PORT ?? 3001),
  secure: !disableInternalMtls,
})

// NOTE: Order matters because first match wins!
export const serviceRoutes: RouteEntry[] = [
  {
    name: 'task-service',
    // matches: /users/:userId/tasks or deeper, e.g. /users/123/tasks, /users/123/tasks/456
    matcher: /^\/users(?:\/[^\/]+)?\/tasks(?:\/|$)/,
    // Route entry is responsible for returning the full target URL. Use a
    // resolver here to assemble a full URL using the configured host/port
    // and the incoming path. This makes it possible to map gateway paths to
    // different backend target paths when needed.
    service: (path: string) => `${taskServiceBaseUrl}${path}`,
  },
  {
    name: 'oauth-service',
    // matches: /users or /users/:id
    matcher: /^\/(?:users|providers|sessions|verification-tokens)(?:\/|$)/,
    service: (path: string) => `${oauthServiceBaseUrl}${path}`,
  },
]
