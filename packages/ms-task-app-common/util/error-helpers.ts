/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ErrorLike } from '../types/error-like.ts'
import type { SerializableError } from '../types/serializable-error.ts'
import { isJsonValue } from './json-helpers.ts'

const DefaultDefaultErrorMsg = 'Unknown error'

export function coalesceErrorMsg(error: unknown, defaultMsg = DefaultDefaultErrorMsg) {
  if (typeof error === 'undefined' || error === null) return defaultMsg
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

export function coalesceError(error: unknown, defaultMsg = DefaultDefaultErrorMsg): Error {
  return error instanceof Error
    ? error
    : new Error(coalesceErrorMsg(error, defaultMsg), { cause: error })
}

export function makeErrorSerializable(error: ErrorLike): SerializableError {
  return {
    message: error.message,
    stack: error.stack,
    cause:
      typeof error.cause === 'undefined'
        ? undefined
        : isJsonValue(error.cause)
          ? error.cause
          : coalesceErrorMsg(error.cause),
  }
}

export function stringifyError(error: ErrorLike) {
  return JSON.stringify(makeErrorSerializable(error))
}
