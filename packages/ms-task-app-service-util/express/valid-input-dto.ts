import otel from '@opentelemetry/api'
import type { NextFunction, ParamsDictionary, Request, Response } from 'express-serve-static-core'
import { coalesceError, coalesceErrorMsg, isErrorLike } from 'ms-task-app-common'
import { mapDtoValidationErrors, type ApiValidationErrorResponse } from 'ms-task-app-dto'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry'
import type { ParsedQs } from 'qs'
import * as z from 'zod'

export type InputDtoValidatorOptions<
  P = ParamsDictionary,
  ResBody = any,
  ReqQuery = ParsedQs,
  LocalsObj extends Record<string, any> = Record<string, any>,
  ZSchema extends z.ZodType = z.ZodType,
> = {
  req: Request<P, ResBody | ApiValidationErrorResponse, z.infer<ZSchema>, ReqQuery, LocalsObj>
  res: Response<ResBody | ApiValidationErrorResponse, LocalsObj, number>
  next: NextFunction
  schema: ZSchema
  inputDto?: z.infer<ZSchema>
  onSucceed?: (data: z.infer<ZSchema>) => any
  validationErrorMsg?: string
  validationErrorStatus?: number
  beforeErrorRespond?: (params: {
    result: ApiValidationErrorResponse
    inputDto: z.infer<ZSchema>
  }) => any
  logger?: ILogger
}

export const DefaultValidationErrorMsg = 'Input validation failed'
export const DefaultValidationErrorStatus = 400

export async function validInputDto<
  ZSchema extends z.ZodType = z.ZodType,
  P = ParamsDictionary,
  ResBody = any,
  ReqQuery = ParsedQs,
  LocalsObj extends Record<string, any> = Record<string, any>,
>({
  req,
  res,
  next,
  schema,
  inputDto,
  onSucceed,
  beforeErrorRespond,
  validationErrorMsg = DefaultValidationErrorMsg,
  validationErrorStatus = DefaultValidationErrorStatus,
  logger = DefaultConsoleLogger,
}: InputDtoValidatorOptions<P, ResBody, ReqQuery, LocalsObj, ZSchema>) {
  const tracer = otel.trace.getTracer('ms-task-app-service-util')
  const result = await tracer.startActiveSpan('input-dto-validation', async validationSpan => {
    validationSpan.setAttribute('operation.type', 'validation')
    validationSpan.setAttribute('request.path', req.path)
    validationSpan.setAttribute('request.method', req.method)
    if (typeof req.headers['content-length'] !== 'undefined') {
      validationSpan.setAttribute('request.content.length', req.headers['content-length'])
    }

    let valSuccess = false
    try {
      inputDto = inputDto || req.body
      const valResult = await schema.safeParseAsync(inputDto)
      valSuccess = valResult.success

      if (valResult.success) {
        validationSpan.addEvent('validation-pass')
        validationSpan.end()

        if (typeof onSucceed === 'function') {
          onSucceed(valResult.data)
        }
      } else {
        const validationErrors = mapDtoValidationErrors(valResult.error)
        const errorRes: ApiValidationErrorResponse = {
          error: true,
          message: validationErrorMsg,
          validationErrors,
        }
        validationSpan.addEvent('validation-error', {
          messages: validationErrors.map(x => x.message),
        })
        if (typeof beforeErrorRespond === 'function') {
          beforeErrorRespond({ result: errorRes, inputDto })
        }
        validationSpan.end()
        res.status(validationErrorStatus).json(errorRes)
      }
    } catch (error) {
      logger.error('Error while validating input DTO', coalesceError(error))
      if (validationSpan.isRecording()) {
        const message = coalesceErrorMsg(error, 'Error while validating input DTO')
        validationSpan.recordException(
          isErrorLike(error) ? error : new Error(message, { cause: error })
        )
        validationSpan.setStatus({ code: otel.SpanStatusCode.ERROR, message })
        validationSpan.end()
      }
    }

    return valSuccess
  })

  // only run the next handler if validation passes
  if (result) {
    next()
  }
}
