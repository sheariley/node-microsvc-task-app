import { trace } from '@opentelemetry/api'
import mongoose from 'mongoose'
import { coalesceError, wait } from 'ms-task-app-common'
import { DefaultConsoleLogger, type ILogger } from 'ms-task-app-telemetry/logging'

import { OTEL_SERVICE_NAME } from '../otel/index.ts'

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
  authMechanism?: mongoose.mongo.AuthMechanism
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
  authMechanism,
  logger = DefaultConsoleLogger,
}: MongoDbConnectOptions) {
  const tracer = trace.getTracer(OTEL_SERVICE_NAME, '0.0.0')
  return await tracer.startActiveSpan(connectMongoDbWithRetry.name, async rootSpan => {
    if (delay <= 0) throw new Error(`Invalid argument value: delay = ${delay}`)
    if (retries <= 0) retries = 1

    const uri = `mongodb://${host}:${port}/${dbName}`
    while (retries) {
      // wait for specified delay
      await wait(delay)
      try {
        logger.info(`Connecting to MongoDB at ${uri}...`)
        const connection = await mongoose.connect(uri, {
          appName,
          tls: !!tls,
          authMechanism,
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

    rootSpan.end()

    return {
      connection: null,
      error: new Error(`Max retries exceeded while connecting to MongoDB at ${uri}!`),
    }
  })
}
