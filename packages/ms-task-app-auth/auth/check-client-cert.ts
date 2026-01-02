import type { ParamsDictionary, Request, RequestHandler, Response } from 'express-serve-static-core'
import type { ParsedQs } from 'qs'
import { TLSSocket, type PeerCertificate } from 'tls'

export type ClientCertCheckParams<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs,
    LocalsObj extends Record<string, any> = Record<string, any>,
> = {
  clientCert?: PeerCertificate
  req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>
  res: Response<ResBody, LocalsObj, number>
}

export type ClientCertChecker<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs,
    LocalsObj extends Record<string, any> = Record<string, any>,
> = {
  (params: ClientCertCheckParams<P, ResBody, ReqBody, ReqQuery, LocalsObj>): Promise<boolean>
}

export function checkClientCert<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs,
    LocalsObj extends Record<string, any> = Record<string, any>,
>(checker: ClientCertChecker<P, ResBody, ReqBody, ReqQuery, LocalsObj>) {
  const _clientCertCheck: RequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj> = async (req, res, next) => {
    let clientCert: PeerCertificate | undefined = undefined
    if (req.socket instanceof TLSSocket) {
      clientCert = req.socket.getPeerCertificate()
    }
    const result = await checker({clientCert, req, res})
    if (!result) {
      res.status(403).json({ error: true, message: 'Unauthorized' } as ResBody)
      return
    } else {
      next()
    }
  }

  return _clientCertCheck
}