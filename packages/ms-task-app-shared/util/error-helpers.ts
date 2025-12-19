/* eslint-disable @typescript-eslint/no-explicit-any */

export function coalesceErrorMsg(error: unknown, defaultMsg = 'Unknown error') {
  return isErrorLike(error)
    ? error.message
    : typeof (error as any).toString === 'function'
      ? (error as any).toString()
      : defaultMsg
}

export function isErrorLike(error: unknown): error is { message: string } {
  return error instanceof Error || (typeof error === 'object' && !!error && typeof (error as any).message === 'string')
}
