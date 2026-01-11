export const dynamic = 'force-dynamic'

import { getAuthConfig } from 'ms-task-app-auth'
import { getServerConfig } from 'ms-task-app-common'
import NextAuth, { type NextAuthConfig } from 'next-auth'

import { OAuthServiceBaseUrl } from './lib/api-routing'

const serverEnv = getServerConfig()

export const { handlers, signIn, signOut, auth } = NextAuth(
  getAuthConfig({
    authServiceUrl: OAuthServiceBaseUrl,
    mtlsFetcherOptions: serverEnv.disableInternalMtls
      ? undefined
      : {
          keyPath: serverEnv.webUi.privateKeyPath,
          certPath: serverEnv.webUi.certPath,
          caPath: serverEnv.webUi.caCertPath,
        },
  }) as NextAuthConfig
)
