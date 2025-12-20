import { type ZodError } from 'zod/v4'

export function mapDtoValidationErrors(error: ZodError) {
  return error.issues.map(x => ({
    code: x.code,
    path: x.path.map(x => (typeof x === 'symbol' ? x.toString() : x)),
    message: x.message,
  }))
}
