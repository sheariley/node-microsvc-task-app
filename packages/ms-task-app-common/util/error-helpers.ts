/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ErrorLike } from '../types/error-like.ts'

export function coalesceErrorMsg(error: unknown, defaultMsg = 'Unknown error') {
  return isErrorLike(error)
    ? error.message
    : typeof (error as any).toString === 'function'
      ? (error as any).toString()
      : defaultMsg
}

export function isErrorLike(error: unknown): error is ErrorLike {
  return (
    error instanceof Error ||
    (typeof error === 'object' && !!error && typeof (error as any).message === 'string')
  )
}
