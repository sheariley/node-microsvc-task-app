import type { ParamsDictionary, Request, Response } from 'express-serve-static-core'
import { ApiError, coalesceError, coalesceErrorMsg, type ErrorLike } from 'ms-task-app-common'
import { mapApiErrorResponse, type ApiErrorResponse } from 'ms-task-app-dto'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry'
import type { ParsedQs } from 'qs'

export type HandleUncaughtOptions<
  P,
  ResBody,
  ReqBody,
  ReqQuery,
  LocalsObj extends Record<string, any> = Record<string, any>,
> = {
  req: Request<P, ResBody | ApiErrorResponse, ReqBody, ReqQuery, LocalsObj>
  res: Response<ResBody | ApiErrorResponse, LocalsObj, number>
  defaultErrorMessage?: string
  defaultErrorStatus?: number
  includeReason?: boolean
  beforeErrorRespond?: (
    error: ErrorLike,
    req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
    res: Response<ResBody, LocalsObj, number>
  ) => any
  logger?: ILogger
}

export const DefaultErrorStatus = 500
export const DefaultErrorMessage = 'Internal Server Error'

export async function handleUncaught<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  LocalsObj extends Record<string, any> = Record<string, any>,
>(
  {
    req,
    res,
    defaultErrorMessage = DefaultErrorMessage,
    defaultErrorStatus = DefaultErrorStatus,
    includeReason,
    beforeErrorRespond,
    logger = DefaultConsoleLogger,
  }: HandleUncaughtOptions<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
  handler: Function
) {
  try {
    const ret = handler()
    if (ret instanceof Promise) {
      return await ret
    } else {
      return ret
    }
  } catch (error) {
    const reason = includeReason ? coalesceErrorMsg(error) : undefined
    const coalesedError = coalesceError(error, reason || 'Unknown error')
    if (typeof beforeErrorRespond === 'function') {
      try {
        beforeErrorRespond(coalesedError, req, res)
      } catch {
        // swallow
        logger.warn('Error occurred during invocation of beforeErrorRespond')
      }
    }

    let response: ApiErrorResponse
    if (error instanceof ApiError) {
      response = mapApiErrorResponse(error)
    } else {
      response = { error: true, message: defaultErrorMessage, reason }
    }
    res.status(defaultErrorStatus).json(response)
  }
}
