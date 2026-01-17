export type ApiErrorResponse = {
  error: true
  message: string
  reason?: string
}

export function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!obj && (obj as any).error === true && typeof (obj as any).message === 'string'
}
