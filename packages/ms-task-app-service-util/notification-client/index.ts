import type { Channel, ChannelModel } from 'amqplib'
import {
  coalesceError,
  getServiceBaseUrl,
  httpResponseHasBody,
  makeErrorSerializable,
  type JsonValue,
} from 'ms-task-app-common'
import { createMtlsFetcher } from 'ms-task-app-mtls'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry'

import { connectMQWithRetry } from '../mq/mq-helpers.ts'

export type NotificationClientOptions = {
  mqHost: string
  mqPort: number
  queueNames: string[]
  mqRetries?: number
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

// TODO: Add tracing

export async function createNotificationClient({
  mqHost,
  mqPort,
  queueNames,
  mqRetries,
  mqRetryDelay,
  mqInitialDelay,
  mqHeartbeat,
  failover,
  tls,
  logger = DefaultConsoleLogger,
}: NotificationClientOptions): Promise<NotificationClient> {
  let initConnect = true
  let connecting = false
  let mqConnection: ChannelModel | null | undefined
  let mqChannel: Channel | null | undefined

  const _connectMQ = async () => {
    if (!connecting) {
      connecting = true
      // cleanup possibly disconnected connection/channel
      try {
        mqConnection?.close()
        mqChannel?.close()
      } catch {
        // swallow
      }

      const mqConnectResult = await connectMQWithRetry({
        host: mqHost,
        port: mqPort,
        retries: mqRetries,
        delay: mqRetryDelay,
        initialDelay: initConnect ? mqInitialDelay : 0,
        heartbeat: mqHeartbeat,
        tls,
        logger,
      })

      // set flag for knowing that an initial connection attempt was made
      // (only use initial delay on first attempt)
      initConnect = false

      if (mqConnectResult.error) {
        logger.error(
          'Failed to connect to message queue. Will try again upon next send request.',
          coalesceError(mqConnectResult.error)
        )
      } else {
        mqConnection = mqConnectResult.mqConnection!
        mqChannel = mqConnectResult.mqChannel!

        mqConnection.on('close', err => {
          logger.warn('MQ connection closed.', coalesceError(err))
          _reconnectMQ()
        })

        mqChannel.on('close', err => {
          logger.warn('MQ channel closed.', coalesceError(err))
          _reconnectMQ()
        })

        logger.info('Asserting message queues...')
        for (let queueName of queueNames) {
          await mqChannel.assertQueue(queueName)
        }
      }
      connecting = false
    }
  }

  const _reconnectMQ = () => {
    queueMicrotask(() => {
      logger.info('Attempting to reconnect to MQ...')
      _connectMQ()
    })
  }

  // initial MQ connect attempt
  _connectMQ()

  let _fetch: (url: string, requestInit: RequestInit) => Promise<Response> = fetch
  if (!!failover && !!tls) {
    const mtlsFetcher = createMtlsFetcher({
      caPath: tls.caCertPath,
      certPath: tls.certPath,
      keyPath: tls.privateKeyPath,
    })
    _fetch = mtlsFetcher.fetch
  }

  return {
    async send(queueName: string, payload: JsonValue) {
      if (!queueNames.includes(queueName)) {
        throw new RangeError('Invalid queue name provided.')
      }

      let msgSent = false
      if (mqChannel) {
        const bufferedPayload = Buffer.from(JSON.stringify(payload))
        try {
          mqChannel.sendToQueue(queueName, bufferedPayload)
          msgSent = true
        } catch (mqError) {
          const defaultMsg = 'Failed to send notification message.'
          console.warn(defaultMsg, {
            err: makeErrorSerializable(coalesceError(mqError, defaultMsg)),
            payload,
          })
          _reconnectMQ()
        }
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
          throw new Error('Failed to send notification message via HTTP failover.', { cause: res })
        }

        logger.warn('Notification message sent via HTTP failover', { payload })

        msgSent = true
      }
    },
  }
}
