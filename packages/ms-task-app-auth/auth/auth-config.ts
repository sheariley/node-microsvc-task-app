import type { AuthConfig } from '@auth/core'
import type { Adapter } from '@auth/core/adapters'
import GitHub from '@auth/core/providers/github'
import { type CreateMtlsFetcherPathOptions } from 'ms-task-app-mtls'
import { RestAdapter } from './authjs-rest-adapter.ts'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry'

export type AuthConfigOptions = {
  authServiceUrl: string
  mtlsFetcherOptions?: CreateMtlsFetcherPathOptions
  onConfigHeaders?: (action: keyof Adapter) => Record<string, string>
  logger?: ILogger
}

export function getAuthConfig({
  authServiceUrl,
  mtlsFetcherOptions,
  onConfigHeaders,
  logger = DefaultConsoleLogger
}: AuthConfigOptions): AuthConfig {
  return {
    adapter: RestAdapter({ baseUrl: authServiceUrl, mtlsFetcherOptions, onConfigHeaders, logger }),
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
