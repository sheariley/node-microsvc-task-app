import type { JsonValue } from './json-value.ts'

export type SerializableError = {
  message: string
  stack?: string
  cause?: JsonValue | SerializableError
}
