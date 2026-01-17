import { HttpError } from './http-error.ts'

export class ApiError extends HttpError {
  details?: Record<string, unknown>

  constructor(
    message: string,
    status: number = 500,
    details?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, status, options)
    this.name = 'ApiError'
    this.details = details
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}
