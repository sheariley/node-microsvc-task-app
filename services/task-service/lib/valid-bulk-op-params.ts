import otel from '@opentelemetry/api'
import type { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import type { BulkOpLocals, Locals } from './express-types.ts'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry'

export async function validBulkOpParams(
  tracer: otel.Tracer,
  req: Request,
  res: Response<any, Locals & BulkOpLocals>,
  next: NextFunction
) {
  const taskIds = req.body as string[]
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
    return res.status(400).json({ error: true, message: validationMsg })
  }

  res.locals.taskIds = taskIds
  next()
}
