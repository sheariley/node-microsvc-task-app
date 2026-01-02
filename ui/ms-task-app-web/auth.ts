import NextAuth, { type NextAuthConfig } from 'next-auth'
import { getAuthConfig } from 'ms-task-app-auth'
import { getServiceBaseUrl } from 'ms-task-app-common'

const disableInternalMtls = process.env.DISABLE_INTERNAL_MTLS === 'true'
const authServiceUrl = getServiceBaseUrl({
  host: process.env.OAUTH_SVC_HOST ?? 'oauth-service',
  port: Number(process.env.OAUTH_SVC_PORT ?? 3001),
  secure: !disableInternalMtls
})

export const { handlers, signIn, signOut, auth } = NextAuth(
  getAuthConfig({
    authServiceUrl,
    mtlsFetcherOptions: disableInternalMtls ? undefined : {
      keyPath: '../../.certs/web-ui/web-ui.key.pem',
      certPath: '../../.certs/web-ui/web-ui.cert.pem',
      caPath: '../../.certs/ca/ca.cert.pem',
    },
  }) as NextAuthConfig
)
