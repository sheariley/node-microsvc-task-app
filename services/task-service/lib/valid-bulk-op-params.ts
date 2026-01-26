import otel from '@opentelemetry/api'
import type { NextFunction, ParamsDictionary, Request, Response } from 'express-serve-static-core'
import mongoose from 'mongoose'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import type { ParsedQs } from 'qs'
import type { ApiErrorResponse } from 'ms-task-app-dto'

import type { BulkOpLocals, Locals } from './express-types.ts'
import logger from './logger.ts'

export async function validBulkOpParams<
  P extends ParamsDictionary = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery extends ParsedQs = ParsedQs,
  LocalsObj extends Locals & BulkOpLocals = Locals & BulkOpLocals,
>(
  req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
  res: Response<ResBody | ApiErrorResponse, LocalsObj, number>,
  next: NextFunction
) {
  const taskIds = req.body as string[]
  const tracer: otel.Tracer = req.app.get('tracer')
  const validationMsg = startSelfClosingActiveSpan(tracer, 'input-validation', () => {
    if (!taskIds?.length) {
      return 'At least one task ID must be provided'
    }
    if (taskIds.some(taskId => !mongoose.isValidObjectId(taskId))) {
      return 'Invalid task ID values in request'
    }
    return null
  })

  if (validationMsg) {
    logger.warn('Bulk task operation input validation failed', { validationMessage: validationMsg })
    return res.status(400).json({ error: true, message: validationMsg })
  }

  res.locals.taskIds = taskIds
  next()
}
