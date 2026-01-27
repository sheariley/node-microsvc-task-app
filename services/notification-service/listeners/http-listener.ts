import bodyParser from 'body-parser'
import express from 'express'
import { checkClientCert } from 'ms-task-app-auth'
import { coalesceError, getServerConfig, makeErrorSerializable } from 'ms-task-app-common'
import type { ApiErrorResponse } from 'ms-task-app-dto'
import {
  ApiUncaughtHandler,
  disableResponseCaching,
  startMtlsHttpServer
} from 'ms-task-app-service-util'
import { reportExceptionIfActiveSpan, startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import { pinoHttp } from 'pino-http'

import logger from '../lib/logger.ts'
import type { MessageListenerOptions } from './listener-types.ts'

export type HttpMessageListenerOptions = MessageListenerOptions & {
  serviceName: string
}

export async function startHttpListener({ handlers, tracer, serviceName }: HttpMessageListenerOptions) {
  const serverEnv = getServerConfig()

  const servicePort = serverEnv.notifySvc.port

  await tracer.startActiveSpan('start-http-listener', async span => {
    try {
      const app = express()
      app.set('trust proxy', true)
      app.set('etag', false)
      app.use(
        pinoHttp({
          logger: logger.pinoInstance,
          wrapSerializers: false,
          autoLogging: {
            ignore: req => req.url.includes('/ping'),
          },
        })
      )
      app.set('logger', logger)
      app.set('tracer', tracer)
      app.use(bodyParser.json())
      app.use(disableResponseCaching)

      if (serverEnv.disableInternalMtls) {
        logger.warn('Running without mTLS.')
      } else {
        logger.info('Initializing mTLS auth middleware...')
        startSelfClosingActiveSpan(tracer, 'mtls-init', () => {
          const authorizedCNs: string[] = [serviceName, 'task-service', 'oauth-service']
          app.use(
            checkClientCert(async ({ clientCert, req }) => {
              if (!clientCert) {
                logger.warn(`Client cert not present for ${req.url}.`)
                return false
              }

              const authorized = !!clientCert && authorizedCNs.includes(clientCert.subject.CN)
              if (!req.url.startsWith('/ping')) {
                if (authorized) {
                  logger.info(
                    `Client cert from ${clientCert.subject.CN} authorized to access ${req.url}.`
                  )
                } else {
                  logger.warn(
                    `Client cert from ${clientCert.subject.CN} NOT authorized to access ${req.url}.`
                  )
                }
              }
              return authorized
            })
          )
        })
      }

      // used for container health-check
      app.get('/ping', async (req, res) => {
        res.status(200).json({ timestamp: Date.now() })
      })

      const queueNames = Object.keys(handlers)

      logger.info('Initializing HTTP message endpoint')
      app.post(`/message/:queueName`, async (req, res) => {
        const { queueName } = req.params
        if (!queueNames.includes(queueName)) {
          logger.warn('Invalid queue name provided in message request', { queueName })
          res.status(404).json({ error: true, message: 'Not found' } as ApiErrorResponse)
          return
        }
        const payload = req.body
        try {
          await handlers[queueName]!(payload)
          res.status(204).send()
        } catch (error) {
          const coalescedError = coalesceError(error, 'Error sending notification email')
          reportExceptionIfActiveSpan(coalescedError)
          logger.error('Error sending notification email', {
            err: makeErrorSerializable(coalescedError),
            content: payload,
          })
        }
      })

      // Not found
      app.use((req, res) => {
        res.status(404).json({ error: true, message: 'Not found' })
      })

      app.use(ApiUncaughtHandler)

      // Start listening
      await startMtlsHttpServer(app, {
        disableMtls: serverEnv.disableInternalMtls,
        port: serverEnv.notifySvc.port,
        privateKeyPath: serverEnv.notifySvc.privateKeyPath,
        certPath: serverEnv.notifySvc.certPath,
        caCertPath: serverEnv.notifySvc.caCertPath,
        requestCert: true,
        rejectUnauthorized: true,
      })

      logger.info(
        `${serviceName} listening on ${serverEnv.disableInternalMtls ? '' : 'secure '}port ${servicePort}`
      )
    } catch (err) {
      const coalescedError = coalesceError(err)
      reportExceptionIfActiveSpan(coalescedError)
      logger.error('Error while starting HTTP message listener', coalescedError)
    } finally {
      span.end()
    }
  })
}
