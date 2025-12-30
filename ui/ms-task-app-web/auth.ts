import NextAuth, { type NextAuthConfig } from 'next-auth'
import { getAuthConfig } from 'ms-task-app-auth'

const authServiceHost = process.env.OAUTH_SVC_HOST ?? 'oauth-service'
const authServicePort = Number(process.env.OAUTH_SVC_PORT ?? 3001)
const authServiceUrl = `http://${authServiceHost}:${authServicePort}`

export const { handlers, signIn, signOut, auth } = NextAuth(getAuthConfig(authServiceUrl) as NextAuthConfig)
