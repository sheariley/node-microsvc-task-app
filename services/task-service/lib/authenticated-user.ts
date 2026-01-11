import { getSession, type Session } from '@auth/express'
import { context as otelContext, propagation } from '@opentelemetry/api'
import type { NextFunction, Request, Response } from 'express'
import { getAuthConfig } from 'ms-task-app-auth'
import { getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'
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
