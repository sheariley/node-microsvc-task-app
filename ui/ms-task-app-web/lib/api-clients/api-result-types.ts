import { JsonValue } from 'ms-task-app-common'

export type ApiErrorResponse = {
  error: true
  message: string
}

export class ApiError extends Error {
  status: number
  details?: Record<string, unknown>

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export type ApiRequestOptions = {
  method?: string
  headers?: Record<string, string>
}

export type ApiRequestOptionsWithBody = ApiRequestOptions & {
  body?: JsonValue
}

export function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!obj && (obj as any).error === true && typeof (obj as any).message === 'string'
}
