import type { AuthConfig } from '@auth/core'
import type { Adapter } from '@auth/core/adapters'
import GitHub from '@auth/core/providers/github'
import { type CreateMtlsFetcherPathOptions } from 'ms-task-app-mtls'
import { RestAdapter } from './authjs-rest-adapter.ts'

export type AuthConfigOptions = {
  authServiceUrl: string
  mtlsFetcherOptions?: CreateMtlsFetcherPathOptions
  onConfigHeaders?: (action: keyof Adapter) => Record<string, string>
}

export function getAuthConfig({
  authServiceUrl,
  mtlsFetcherOptions,
  onConfigHeaders
}: AuthConfigOptions): AuthConfig {
  return {
    adapter: RestAdapter({ baseUrl: authServiceUrl, mtlsFetcherOptions, onConfigHeaders }),
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
