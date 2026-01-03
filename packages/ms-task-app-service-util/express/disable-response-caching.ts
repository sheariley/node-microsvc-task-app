import type {
  NextFunction,
  ParamsDictionary,
  Request,
  Response
} from 'express-serve-static-core'
import type { ParsedQs } from 'qs'

export function disableResponseCaching<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  LocalsObj extends Record<string, any> = Record<string, any>,
>(
  req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
  res: Response<ResBody, LocalsObj, number>,
  next: NextFunction
) {
  res.header(
    'Cache-Control',
    'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
  )
  res.header('Expires', '-1')
  res.header('Pragma', 'no-cache')
  next()
}
