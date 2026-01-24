import amqp from 'amqplib'
import fs from 'fs'
import { coalesceError, wait } from 'ms-task-app-common'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry'

export type MqConnectOptions = {
  host: string
  port: number
  retries?: number
  delay?: number
  initialDelay?: number
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
  tls,
  logger = DefaultConsoleLogger,
}: MqConnectOptions) {
  if (retries <= 0) throw new Error(`Invalid argument value: retries = ${retries}`)
  if (delay <= 0) throw new Error(`Invalid argument value: delay = ${delay}`)

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
        },
        socketOptions
      )
      logger.info('Connected to RabbitMQ server. Opening channel...')
      const mqChannel = await mqConnection.createChannel()
      logger.info('RabbitMQ connected and channel opened.')
      return { mqConnection, mqChannel, error: null }
    } catch (error) {
      logger.info('RabbitMQ Connection Error: ', coalesceError(error))
      retries--
      if (retries > 0) {
        logger.info('Retrying connection. Retries left: ', retries)
      } else {
        return { mqConnection: null, mqChannel: null, error }
      }
    }
  }
  return {
    mqConnection: null,
    mqChannel: null,
    error: new Error(`Max retries exceeded while connecting to RabbitMQ at ${uri}!`),
  }
}
