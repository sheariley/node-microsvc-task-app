import amqp, { type Channel, type ChannelModel } from 'amqplib'
import fs from 'fs'
import { coalesceError, wait, type JsonArray, type JsonObject, type JsonValue } from 'ms-task-app-common'
import {
  DefaultConsoleLogger,
  reportExceptionIfActiveSpan,
  type ILogger,
} from 'ms-task-app-telemetry'

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
  return {
    mqConnection: null,
    mqChannel: null,
    error: new Error(`Max retries exceeded while connecting to RabbitMQ at ${uri}!`),
  }
}

export type MessageConsumer<TPayload = any> = (payload: TPayload) => Promise<void>

export type MessageConsumerMap = Record<string, MessageConsumer>

export type PersistentMQClientOptions = Omit<MqConnectOptions, 'retries'> & {
  queueNames?: string[]
  consumers?: MessageConsumerMap
}

export interface PersistentMQClient {
  send<TPayload = any>(queueName: string, payload: TPayload): Promise<void>
}

export async function createPersistentMQClient({
  queueNames,
  consumers,
  logger = DefaultConsoleLogger,
  ...connectOptions
}: PersistentMQClientOptions): Promise<PersistentMQClient> {

  // TODO: Add tracing
  let connectPromise: Promise<Channel> | null = null
  let initConnect = true
  let reconnecting = false
  let mqConnection: ChannelModel | null | undefined
  let mqChannel: Channel | null | undefined

  const consumerQueueNames = Object.keys(consumers || {})
  queueNames = !queueNames?.length ? consumerQueueNames : queueNames

  const _onConnectionCloseOrError = (err: any) => {
    logger.warn('MQ connection closed.', coalesceError(err))
    _reconnectMQ()
  }

  const _onChannelCloseOrError = (err: any) => {
    logger.warn('MQ channel errored or closed.', coalesceError(err))
    _reconnectMQ()
  }

  const _connectMQ = async (immediate = false) => {
    if (connectPromise) return connectPromise

    const deferred = Promise.withResolvers<Channel>()
    connectPromise = deferred.promise

    // cleanup possibly disconnected connection/channel
    try {
      if (mqChannel) {
        mqChannel.removeAllListeners('close')
        mqChannel.removeAllListeners('error')
        mqChannel = null
      }

      if (mqConnection) {
        mqConnection.removeAllListeners('close')
        mqConnection.removeAllListeners('error')
        mqConnection = null
      }
    } catch {
      // swallow
    }

    const mqConnectResult = await connectMQWithRetry({
      ...connectOptions,
      retries: 0, // handle retries within this client
      initialDelay: initConnect && !immediate ? connectOptions.initialDelay : 0,
      logger,
    })

    // set flag for knowing that an initial connection attempt was made
    // (only use initial delay on first attempt)
    initConnect = false

    if (mqConnectResult.error) {
      const coalescedError = coalesceError(mqConnectResult.error)
      logger.error(
        'Failed to connect to message queue.',
        coalescedError
      )
      deferred.reject(coalescedError)
    } else {
      mqConnection = mqConnectResult.mqConnection!
      mqChannel = mqConnectResult.mqChannel!

      mqConnection.on('close', _onConnectionCloseOrError)
      mqConnection.on('error', _onConnectionCloseOrError)
      mqChannel.on('close', _onChannelCloseOrError)
      mqChannel.on('error', _onChannelCloseOrError)

      if (queueNames.length) {
        logger.info('Asserting message queues...')
        for (let queueName of queueNames) {
          await mqChannel.assertQueue(queueName)
        }
      }

      if (consumerQueueNames.length) {
        for (let queueName of consumerQueueNames) {
          mqChannel.consume(queueName, msg => {
            if (msg) {
              try {
                const payload = JSON.parse(msg.content.toString())
                consumers![queueName]!(payload)
              } catch (error) {
                const coalescedError = coalesceError(error)
                reportExceptionIfActiveSpan(coalescedError)
                logger.error('Error while consuming message', coalescedError)
              }
            }
          })
        }
      }
      deferred.resolve(mqChannel)
    }

    return connectPromise
  }

  const _reconnectMQ = () => {
    if (reconnecting) return
    reconnecting = true    
    connectPromise = null
    queueMicrotask(async () => {
      logger.info('Attempting to reconnect to MQ...')
      try {
        await _connectMQ()
        reconnecting = false
      } catch (error) {
        reconnecting = false
        logger.error('MQ reconnect failed', coalesceError(error))
        queueMicrotask(() => _reconnectMQ()) // keep trying to reconnect
      }
    })
  }

  // initial MQ connect attempt
  try {
    await _connectMQ()
  } catch (error) {
    logger.error('Initial MQ connection failed', coalesceError(error))
  }

  return {
    async send<TPayload = any>(queueName: string, payload: TPayload) {
      if (!queueNames.includes(queueName)) {
        throw new RangeError('Invalid queue name provided.')
      }
      if (!connectPromise) {
        _connectMQ(true)
      }
      if (!connectPromise) {
        throw new Error('Failed to connect to message queue')
      }
      const channel = await connectPromise
      const bufferedPayload = Buffer.from(JSON.stringify(payload))
      channel.sendToQueue(queueName, bufferedPayload)
    },
  }
}
