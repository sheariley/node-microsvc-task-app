import { RouteEntry } from '@/lib/api-routing'
import { getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'

const serverEnv = getServerConfig()

const taskServiceBaseUrl = getServiceBaseUrl({
  host: serverEnv.taskSvc.host,
  port: serverEnv.taskSvc.port,
  secure: !serverEnv.disableInternalMtls,
})
const oauthServiceBaseUrl = getServiceBaseUrl({
  host: serverEnv.oauthSvc.host,
  port: serverEnv.oauthSvc.port,
  secure: !serverEnv.disableInternalMtls,
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
