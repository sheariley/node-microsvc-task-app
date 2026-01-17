import { getSession, type Session } from '@auth/express'
import otel from '@opentelemetry/api'
import type { NextFunction, Request, Response } from 'express'
import { getAuthConfig } from 'ms-task-app-auth'
import { getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry'

import type { Locals } from './express-types.ts'

const serverEnv = getServerConfig()
const authServiceUrl = getServiceBaseUrl({
  host: serverEnv.oauthSvc.host,
  port: serverEnv.oauthSvc.port,
  secure: !serverEnv.disableInternalMtls,
})
const authConfig = getAuthConfig({
  authServiceUrl,
  mtlsFetcherOptions: serverEnv.disableInternalMtls
    ? undefined
    : {
        keyPath: serverEnv.taskSvc.privateKeyPath,
        certPath: serverEnv.taskSvc.certPath,
        caPath: serverEnv.taskSvc.caCertPath,
      },
})

export async function authenticatedUser(
  tracer: otel.Tracer,
  req: Request,
  res: Response<any, Locals>,
  next: NextFunction
) {
  const result = await startSelfClosingActiveSpan(tracer, 'auth-check', async () => {
    const session: Session | null | undefined =
      res.locals.session ?? (await getSession(req, authConfig))
    return !session?.user ? 'Unauthenticated' : session.user
  })

  if (typeof result === 'string') {
    res.status(401).json({ error: true, message: result })
  } else {
    res.locals.user = result
    next()
  }
}
