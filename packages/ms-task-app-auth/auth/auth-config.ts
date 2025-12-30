import type { AuthConfig } from '@auth/core'
import GitHub from '@auth/core/providers/github'
import { RestAdapter } from 'ms-task-app-auth'

export function getAuthConfig(authServiceUrl: string): AuthConfig {
  return {
    adapter: RestAdapter({ baseUrl: authServiceUrl }),
    providers: [GitHub],
    session: {
      strategy: 'jwt',
    },
    callbacks: {
      async session({ session, token }) {
        if (token.sub) {
          return {
            ...session,
            user: {
              ...session.user,
              id: token.sub,
            },
          }
        }
        return session
      },
    },
  }
}
