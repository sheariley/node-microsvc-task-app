import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { RestAdapter } from './lib/auth/authjs-rest-adapter'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: RestAdapter({
    baseUrl: `http://${process.env.OAUTH_SVC_HOST}:${process.env.OAUTH_SVC_PORT}`,
  }),
  providers: [GitHub],
})
