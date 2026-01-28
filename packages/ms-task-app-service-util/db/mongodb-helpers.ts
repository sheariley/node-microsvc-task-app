import mongoose from 'mongoose'
import { coalesceError, wait } from 'ms-task-app-common'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry/logging'

export type MongoDbConnectOptions = {
  host: string
  port: number
  dbName: string
  retries?: number
  delay?: number
  appName: string
  tls?: {
    tlsCAFile: string
    tlsCertificateKeyFile: string
  }
  logger?: ILogger
}

export async function connectMongoDbWithRetry({
  host,
  port,
  dbName,
  appName,
  retries = 5,
  delay = 3000,
  tls,
  logger = DefaultConsoleLogger,
}: MongoDbConnectOptions) {
  if (retries <= 0) throw new Error(`Invalid argument value: retries = ${retries}`)
  if (delay <= 0) throw new Error(`Invalid argument value: delay = ${delay}`)

  const uri = `mongodb://${host}:${port}/${dbName}`
  while (retries) {
    // wait for specified delay
    await wait(delay)
    try {
      logger.info(`Connecting to MongoDB at ${uri}...`)
      const connection = await mongoose.connect(uri, {
        appName,
        tls: !!tls,
        ...(tls ? tls : {}),
      })
      logger.info('Connected to MongoDB')
      return { connection, error: null }
    } catch (error) {
      logger.error('MongoDB connection error: ', coalesceError(error))
      retries--
      if (retries > 0) {
        logger.info('Retrying connection.', { retriesRemaining: retries })
      } else {
        return { connection: null, error }
      }
    }
  }
  return {
    connection: null,
    error: new Error(`Max retries exceeded while connecting to MongoDB at ${uri}!`),
  }
}
