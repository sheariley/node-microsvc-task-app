export function httpResponseHasBody(status: number, method: string | null | undefined) {
  return (
    method?.toLowerCase() !== 'head' &&
    status >= 200 &&
    status !== 204 &&
    status !== 205 &&
    status !== 304
  )
}
