export type ValidationError = {
  code: string
  path: (string | number)[]
  message: string
}
