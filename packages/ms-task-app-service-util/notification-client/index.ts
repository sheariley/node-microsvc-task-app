import { trace } from '@opentelemetry/api'
import {
  coalesceError,
  getServiceBaseUrl,
  httpResponseHasBody,
  makeErrorSerializable,
  type JsonValue,
} from 'ms-task-app-common'
import { createMtlsFetcher } from 'ms-task-app-mtls'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry'

import { createPersistentMQClient } from '../mq/mq-helpers.ts'
import { OTEL_SERVICE_NAME } from '../otel/index.ts'

export type NotificationClientOptions = {
  mqHost: string
  mqPort: number
  queueNames: string[]
  mqRetryDelay?: number
  mqInitialDelay?: number
  mqHeartbeat?: number
  failover?: {
    httpHost: string
    httpPort: number
  }
  tls?: {
    caCertPath: string
    certPath: string
    privateKeyPath: string
  }
  logger?: ILogger
}

export type NotificationClient = {
  send(queueName: string, payload: JsonValue): Promise<void>
}

export async function createNotificationClient({
  mqHost,
  mqPort,
  queueNames,
  mqRetryDelay,
  mqInitialDelay,
  mqHeartbeat,
  failover,
  tls,
  logger = DefaultConsoleLogger,
}: NotificationClientOptions): Promise<NotificationClient> {
  const tracer = trace.getTracer(OTEL_SERVICE_NAME, '0.0.0')
  return await tracer.startActiveSpan(createNotificationClient.name, async rootSpan => {
    const mqClient = await createPersistentMQClient({
      host: mqHost,
      port: mqPort,
      queueNames,
      delay: mqRetryDelay,
      initialDelay: mqInitialDelay,
      heartbeat: mqHeartbeat,
      tls,
      logger,
    })

    let _fetch: (url: string, requestInit: RequestInit) => Promise<Response> = fetch
    if (!!failover && !!tls) {
      const mtlsFetcher = createMtlsFetcher({
        caPath: tls.caCertPath,
        certPath: tls.certPath,
        keyPath: tls.privateKeyPath,
      })
      _fetch = mtlsFetcher.fetch
    }

    rootSpan.end()

    return {
      async send(queueName: string, payload: JsonValue) {
        if (!queueNames.includes(queueName)) {
          throw new RangeError('Invalid queue name provided.')
        }

        let msgSent = false
        try {
          mqClient.send(queueName, payload)
          msgSent = true
        } catch (mqError) {
          const defaultMsg = 'Failed to send notification message.'
          console.warn(defaultMsg, {
            err: makeErrorSerializable(coalesceError(mqError, defaultMsg)),
            payload,
          })
        }

        if (!msgSent && !!failover) {
          const baseUrl = getServiceBaseUrl({
            host: failover.httpHost,
            port: failover.httpPort,
            secure: !!tls,
          })
          const res = await _fetch(`${baseUrl}/message/${queueName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (!res.ok) {
            let errorResult: JsonValue | null = null
            if (httpResponseHasBody(res.status, 'POST') && !!res.body) {
              errorResult = (await res.json()) as JsonValue
            }
            logger.error('Failed to send notification message via HTTP failover.', {
              result: errorResult,
            })
            throw new Error('Failed to send notification message via HTTP failover.', {
              cause: res,
            })
          }

          logger.warn('Notification message sent via HTTP failover', { payload })

          msgSent = true
        }
      },
    }
  })
}
