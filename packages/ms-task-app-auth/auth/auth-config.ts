import type { AuthConfig } from '@auth/core'
import GitHub from '@auth/core/providers/github'
import { RestAdapter, type CreateMtlsFetcherPathOptions } from 'ms-task-app-auth'

export type AuthConfigOptions = {
  authServiceUrl: string
  mtlsFetcherOptions?: CreateMtlsFetcherPathOptions
}

export function getAuthConfig({
  authServiceUrl,
  mtlsFetcherOptions,
}: AuthConfigOptions): AuthConfig {
  return {
    adapter: RestAdapter({ baseUrl: authServiceUrl, mtlsFetcherOptions }),
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
