import { type ApiError, isErrorLike } from 'ms-task-app-common'
import { type ZodError } from 'zod/v4'
import type { ApiErrorResponse } from '../models/errors/api-error-response.ts'
import type { ValidationError } from '../models/errors/validation-error.ts'

export function mapDtoValidationErrors(error: ZodError) {
  return error.issues.map(
    x =>
      ({
        code: x.code,
        path: x.path.map(x => (typeof x === 'symbol' ? x.toString() : x)),
        message: x.message,
      }) as ValidationError
  )
}

export function mapApiErrorResponse(error: ApiError) {
  return {
    error: true,
    message: error.message,
    reason: isErrorLike(error.cause) ? error.message : undefined,
  } as ApiErrorResponse
}
