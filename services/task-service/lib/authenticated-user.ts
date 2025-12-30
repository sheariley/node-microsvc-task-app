import { getSession, type Session } from '@auth/express'
import type { NextFunction, Request, Response } from 'express'
import { getAuthConfig } from 'ms-task-app-auth'
import type { Locals } from './express-types.ts'

const authServiceHost = process.env.OAUTH_SVC_HOST ?? 'oauth-service'
const authServicePort = Number(process.env.OAUTH_SVC_PORT ?? 3001)
const authServiceUrl = `http://${authServiceHost}:${authServicePort}`
const authConfig = getAuthConfig(authServiceUrl)

export async function authenticatedUser(
  req: Request,
  res: Response<any, Locals>,
  next: NextFunction
) {
  const session: Session | null | undefined =
    res.locals.session ?? (await getSession(req, authConfig))
  if (!session?.user) {
    res.status(401).json({ error: true, message: 'Unauthenticated' })
  } else {
    res.locals.user = session.user
    next()
  }
}
