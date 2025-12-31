import NextAuth, { type NextAuthConfig } from 'next-auth'
import { getAuthConfig } from 'ms-task-app-auth'

const authServiceHost = process.env.OAUTH_SVC_HOST ?? 'oauth-service'
const authServicePort = Number(process.env.OAUTH_SVC_PORT ?? 3001)
const authServiceUrl = `http://${authServiceHost}:${authServicePort}`

export const { handlers, signIn, signOut, auth } = NextAuth(
  getAuthConfig({
    authServiceUrl,
    mtlsFetcherOptions: process.env.REQUIRE_INTERNAL_MTLS ? {
      keyPath: '../../.certs/web-ui/web-ui.key.pem',
      certPath: '../../.certs/web-ui/web-ui.cert.pem',
      caPath: '../../.certs/ca/ca.cert.pem',
    } : undefined,
  }) as NextAuthConfig
)
