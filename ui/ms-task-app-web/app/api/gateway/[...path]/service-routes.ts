import { OAuthServiceBaseUrl, RouteEntry, TaskServiceBaseUrl } from '@/lib/api-routing'

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
    service: (path: string) => `${TaskServiceBaseUrl}${path}`,
  },
  {
    name: 'oauth-service',
    // matches: /users or /users/:id
    matcher: /^\/(?:users|providers|sessions|verification-tokens)(?:\/|$)/,
    service: (path: string) => `${OAuthServiceBaseUrl}${path}`,
  },
]
