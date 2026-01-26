import type { ErrorRequestHandler } from 'express-serve-static-core'
import { ApiError, coalesceError, makeErrorSerializable } from 'ms-task-app-common'
import { mapApiErrorResponse, type ApiErrorResponse } from 'ms-task-app-dto'
import { createConsoleLogger, type ILogger } from 'ms-task-app-telemetry'

export const DefaultErrorStatus = 500
export const DefaultErrorMessage = 'Internal Server Error'

export const ApiUncaughtHandler: ErrorRequestHandler = (err: any, req, res, next) => {
  const coalesedError = coalesceError(err, res.locals.defaultErrorMessage || DefaultErrorMessage)
  const logger: ILogger = req.app.get('logger') || createConsoleLogger()
  logger.error(coalesedError.message, {
    err: makeErrorSerializable(coalesedError),
    params: req.params,
  })
  let response: ApiErrorResponse
  if (err instanceof ApiError) {
    response = mapApiErrorResponse(err)
  } else {
    response = { error: true, message: coalesedError.message }
  }
  res.status(DefaultErrorStatus).json(response)
}
