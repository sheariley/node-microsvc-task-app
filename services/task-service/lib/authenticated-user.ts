import { getSession, type Session } from '@auth/express'
import otel from '@opentelemetry/api'
import type { NextFunction, ParamsDictionary, Request, Response } from 'express-serve-static-core'
import { getAuthConfig } from 'ms-task-app-auth'
import { coalesceError, getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'
import type { ApiErrorResponse } from 'ms-task-app-dto'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import type { ParsedQs } from 'qs'

import type { Locals } from './express-types.ts'
import logger from './logger.ts'

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
  logger,
})

export async function authenticatedUser<
  P extends ParamsDictionary = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery extends ParsedQs = ParsedQs,
  LocalsObj extends Locals = Locals,
>(
  req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
  res: Response<ResBody | ApiErrorResponse, LocalsObj, number>,
  next: NextFunction
) {
  const tracer: otel.Tracer = req.app.get('tracer')
  const result = await startSelfClosingActiveSpan(tracer, 'auth-check', async () => {
    try {
      const session: Session | null | undefined =
        res.locals.session ?? (await getSession(req, authConfig))
      return !session?.user ? 'Unauthenticated' : session.user
    } catch (error) {
      logger.error('Error occurred during authentication check', coalesceError(error))
      return 'Unauthenticated'
    }
  })

  if (typeof result === 'string') {
    res.status(401).json({ error: true, message: result } as ApiErrorResponse)
  } else {
    res.locals.user = result
    next()
  }
}
