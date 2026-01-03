import NextAuth, { type NextAuthConfig } from 'next-auth'
import { getAuthConfig } from 'ms-task-app-auth'
import { getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'

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
      keyPath: '../../.certs/web-ui/web-ui.key.pem',
      certPath: '../../.certs/web-ui/web-ui.cert.pem',
      caPath: '../../.certs/ca/ca.cert.pem',
    },
  }) as NextAuthConfig
)
