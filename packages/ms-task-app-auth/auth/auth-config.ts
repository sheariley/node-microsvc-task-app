import type { AuthConfig } from '@auth/core'
import GitHub from '@auth/core/providers/github'
import { type CreateMtlsFetcherPathOptions } from 'ms-task-app-mtls'
import { RestAdapter } from './authjs-rest-adapter.ts'

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
      async jwt({ token, user }) {
        // 'user' is only available the first time the callback is called on signin
        if (user) {
          token.id = user.id
        }
        return token
      },
      async session({ session, token }) {
        if (token?.id) {
          return {
            ...session,
            user: {
              ...session.user,
              id: token.id as string,
            },
          }
        }
        return session
      },
    },
  }
}
