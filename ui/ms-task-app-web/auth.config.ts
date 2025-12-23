import type { NextAuthConfig } from 'next-auth'
import GitHub from 'next-auth/providers/github'

// lightweight auth config for use in middleware (edge environment)
export default {
  providers: [GitHub],
} satisfies NextAuthConfig
