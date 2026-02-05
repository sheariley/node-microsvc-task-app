import { trace } from '@opentelemetry/api'
import amqp from 'amqplib'
import fs from 'fs'
import { coalesceError, wait } from 'ms-task-app-common'
import {
  DefaultConsoleLogger,
  type ILogger
} from 'ms-task-app-telemetry'

import { OTEL_SERVICE_NAME } from '../otel/index.ts'

export type MqConnectOptions = {
  host: string
  port: number
  retries?: number
  delay?: number
  initialDelay?: number
  heartbeat?: number
  tls?: {
    caCertPath: string
    certPath: string
    privateKeyPath: string
  }
  logger?: ILogger
}

export async function connectMQWithRetry({
  host,
  port,
  retries = 5,
  delay = 3000,
  initialDelay = 7000,
  heartbeat = 30,
  tls,
  logger = DefaultConsoleLogger,
}: MqConnectOptions) {
  // TODO: Pull version from package.json???
  const tracer = trace.getTracer(OTEL_SERVICE_NAME, '0.0.0')
  return await tracer.startActiveSpan(connectMQWithRetry.name, async rootSpan => {
    if (delay <= 0) throw new RangeError(`Invalid argument value: delay = ${delay}`)
    if (retries <= 0) retries = 1

    if (initialDelay) {
      logger.info('Waiting for MQ server to start...')
      // give the MQ server time to start
      await wait(initialDelay)
    }

    const protocol = tls ? 'amqps' : 'amqp'
    const uri = `${protocol}://${host}:${port}`
    let socketOptions: any
    if (tls) {
      socketOptions = {
        ca: [fs.readFileSync(tls.caCertPath)],
        cert: fs.readFileSync(tls.certPath),
        key: fs.readFileSync(tls.privateKeyPath),
        rejectUnauthorized: true,
      }
    }

    while (retries) {
      // wait for specified delay
      await wait(delay)
      try {
        logger.info(`Connecting to RabbitMQ at ${uri}...`)
        const mqConnection = await amqp.connect(
          {
            hostname: host,
            port,
            protocol,
            heartbeat,
          },
          socketOptions
        )
        logger.info('Connected to RabbitMQ server. Opening channel...')
        const mqChannel = await mqConnection.createChannel()
        logger.info('RabbitMQ connected and channel opened.')
        return { mqConnection, mqChannel, error: null }
      } catch (error) {
        logger.error('RabbitMQ Connection Error: ', coalesceError(error))
        retries--
        if (retries > 0) {
          logger.info('Retrying connection.', { retriesRemaining: retries })
        } else {
          return { mqConnection: null, mqChannel: null, error }
        }
      }
    }

    rootSpan.end()

    return {
      mqConnection: null,
      mqChannel: null,
      error: new Error(`Max retries exceeded while connecting to RabbitMQ at ${uri}!`),
    }
  })
}
