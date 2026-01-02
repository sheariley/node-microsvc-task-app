import { getSession, type Session } from '@auth/express'
import type { NextFunction, Request, Response } from 'express'
import { getAuthConfig } from 'ms-task-app-auth'
import type { Locals } from './express-types.ts'
import { getServiceBaseUrl } from 'ms-task-app-common'

const disableInternalMtls = process.env.DISABLE_INTERNAL_MTLS === 'true'
const authServiceUrl = getServiceBaseUrl({
  host: process.env.OAUTH_SVC_HOST ?? 'oauth-service',
  port: Number(process.env.OAUTH_SVC_PORT ?? 3001),
  secure: !disableInternalMtls
})
const authConfig = getAuthConfig({
  authServiceUrl,
  mtlsFetcherOptions: disableInternalMtls ? undefined : {
    keyPath: '../../.certs/task-service/task-service.key.pem',
    certPath: '../../.certs/task-service/task-service.cert.pem',
    caPath: '../../.certs/ca/ca.cert.pem',
  }
})

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
