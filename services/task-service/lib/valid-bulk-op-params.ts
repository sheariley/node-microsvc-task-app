import type { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import type { BulkOpLocals, Locals } from './express-types.ts'

export async function validBulkOpParams(
  req: Request,
  res: Response<any, Locals & BulkOpLocals>,
  next: NextFunction
) {
  const taskIds = req.body as string[]
  if (!taskIds?.length) {
    return res.status(400).json({ error: true, message: 'At least one task ID must be provided' })
  }

  if (taskIds.some(taskId => !mongoose.isValidObjectId(taskId))) {
    return res.status(400).json({ error: true, message: 'Invalid task ID values in request' })
  }
  res.locals.taskIds = taskIds
  next()
}
