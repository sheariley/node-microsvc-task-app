import type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from '../types/json-value.ts'

export function isJsonPrimitive(obj: unknown): obj is JsonPrimitive {
  return (
    obj === null || typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean'
  )
}

export function isJsonArray(obj: unknown): obj is JsonArray {
  return Array.isArray(obj) && (!obj.length || obj.every(isJsonValue))
}

export function isJsonObject(obj: unknown): obj is JsonObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    (!Object.values(obj).length || Object.values(obj).every(isJsonValueOrUndefined))
  )
}

export function isJsonValue(obj: unknown): obj is JsonValue {
  return isJsonPrimitive(obj) || isJsonArray(obj) || isJsonObject(obj)
}

export function isJsonValueOrUndefined(obj: unknown) {
  return isJsonValue(obj) || typeof obj === 'undefined'
}