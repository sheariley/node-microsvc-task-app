import type { ServerResponse } from 'http'

export function minResponseSerializer(res: ServerResponse) {
  return {
    url: res.req?.url,
    method: res.req?.method,
    statusCode: res.statusCode,
    statusMessage: res.statusMessage,
    contentLength: res.getHeader('content-length'),
    contentType: res.getHeader('content-type'),
    userId: (res as any).locals?.user?.id,
  }
}
