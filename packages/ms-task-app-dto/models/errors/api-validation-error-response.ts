import type { ApiErrorResponse } from './api-error-response.ts'
import type { ValidationError } from './validation-error.ts'

export type ApiValidationErrorResponse = ApiErrorResponse & {
  validationErrors: ValidationError[]
}
