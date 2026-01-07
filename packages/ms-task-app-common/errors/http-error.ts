export class HttpError extends Error {
  status: number
  constructor(message: string, status = 500, options?: ErrorOptions) {
    super(message, options)
    this.status = status
    Object.setPrototypeOf(this, HttpError.prototype)
  }
}
