import type { Express } from 'express-serve-static-core'
import fs from 'fs'
import https from 'https'

export type MtlsHttpServerOptions = {
  port: number
  disableMtls: boolean
  privateKeyPath: string
  certPath: string
  caCertPath: string
  requestCert?: boolean
  rejectUnauthorized?: boolean
}

export async function startMtlsHttpServer(app: Express, options: MtlsHttpServerOptions) {
  const deferred = Promise.withResolvers<void>()

  const { port, disableMtls } = options

  if (disableMtls) {
    app.listen(port, error => {
      if (error) deferred.reject(error)
      else deferred.resolve()
    })
  } else {
    const { privateKeyPath, certPath, caCertPath, requestCert, rejectUnauthorized } = options

    const httpsServerOptions: https.ServerOptions = {
      key: fs.readFileSync(privateKeyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.readFileSync(caCertPath),
      requestCert,
      rejectUnauthorized,
    }
    const server = https
      .createServer(httpsServerOptions, app)
      .listen(port, () => {
        deferred.resolve()
      })
      .once('error', err => {
        if (!server.listening) {
          deferred.reject(err)
        }
      })
  }

  return deferred.promise
}
