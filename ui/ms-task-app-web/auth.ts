export const dynamic = 'force-dynamic'

import { context as otelContext, propagation } from '@opentelemetry/api'
import { getAuthConfig } from 'ms-task-app-auth'
import { getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'
import NextAuth, { type NextAuthConfig } from 'next-auth'

const serverEnv = getServerConfig()

const authServiceUrl = getServiceBaseUrl({
  host: serverEnv.oauthSvc.host,
  port: serverEnv.oauthSvc.port,
  secure: !serverEnv.disableInternalMtls
})

export const { handlers, signIn, signOut, auth } = NextAuth(
  getAuthConfig({
    authServiceUrl,
    mtlsFetcherOptions: serverEnv.disableInternalMtls ? undefined : {
      keyPath: serverEnv.webUi.privateKeyPath,
      certPath: serverEnv.webUi.certPath,
      caPath: serverEnv.webUi.caCertPath,
    },
    onConfigHeaders: () => {
      const headers: Record<string, string> = {}
      try {
        propagation.inject(otelContext.active(), headers)
      } catch (error) {
        // Non-fatal: if propagation fails, continue without injected headers
        console.warn('OpenTelemetry header injection failed', error)
      }
      return headers
    }
  }) as NextAuthConfig
)
