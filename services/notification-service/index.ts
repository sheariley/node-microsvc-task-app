import './instrumentation.ts'

import otel from '@opentelemetry/api'
import { coalesceError, getServerConfig, redactedServerConfig } from 'ms-task-app-common'
import { connectMongoDbWithRetry } from 'ms-task-app-service-util'

import logger from './lib/logger.ts'
import { createMailer } from './lib/mailer.ts'
import { startHttpListener } from './listeners/http-listener.ts'
import type { MessageHandlerMap } from './listeners/listener-types.ts'
import { startMqListener } from './listeners/mq-listener.ts'
import {
  createAccountLinkedMessageHandler,
  createTaskCreatedMessageHandler,
  createTaskUpdatedMessageHandler,
} from './msg-handlers/index.ts'

// Server settings
const serviceName = 'notification-service'

async function main() {
  process.on('uncaughtException', err => {
    logger.fatal('Uncaught error during initialization', err)
    process.exit(1)
  })

  // TODO: Pull service-version from package.json
  const tracer = otel.trace.getTracer(serviceName, '1.0.0')
  await tracer.startActiveSpan('service-startup', async startupSpan => {
    try {
      const serverEnv = getServerConfig()
      console.info('Sever Config', redactedServerConfig(serverEnv))

      const { connection: userDbCon, error: userDbConError } = await tracer.startActiveSpan(
        'mongodb-connect',
        async mongoDbConSpan => {
          const result = (await connectMongoDbWithRetry({
            host: serverEnv.mongodb.host,
            port: serverEnv.mongodb.port,
            dbName: 'oauth',
            appName: 'notification-service',
            tls: serverEnv.disableInternalMtls
              ? undefined
              : {
                  tlsCAFile: serverEnv.notifySvc.caCertPath,
                  tlsCertificateKeyFile: serverEnv.notifySvc.keyCertComboPath,
                },
            logger,
          }))!
          mongoDbConSpan.end()
          return result
        }
      )

      if (userDbConError || !userDbCon) {
        process.exit(1)
      }

      logger.info('Creating mail transport...')
      const mailer = await tracer.startActiveSpan(
        'mail-transport-init',
        async mailTransInitSpan => {
          const result = createMailer({
            ...serverEnv.smtp,
            fromEmail: serverEnv.notifySvc.fromEmail,
          })
          mailTransInitSpan.end()
          return result
        }
      )

      const { accountLinkedQueueName, taskCreatedQueueName, taskUpdatedQueueName } =
        serverEnv.rabbitmq
      const handlers: MessageHandlerMap = {
        [accountLinkedQueueName]: createAccountLinkedMessageHandler(tracer, mailer),
        [taskCreatedQueueName]: createTaskCreatedMessageHandler(tracer, mailer),
        [taskUpdatedQueueName]: createTaskUpdatedMessageHandler(tracer, mailer),
      }

      logger.info('Starting HTTP message listener')
      await startHttpListener({ handlers, serviceName, tracer })

      logger.info('Starting MQ message listener')
      await startMqListener({ handlers, tracer })

      logger.info(`${serviceName} startup successful. Listening for messages...`)
    } catch (error) {
      const coalescedError = coalesceError(error, 'Fatal exception during startup')
      logger.fatal('Fatal error during startup', coalescedError)
      startupSpan.recordException(coalescedError)
      startupSpan.end()
      process.exit(1)
    } finally {
      startupSpan.end()
    }
  })
}

main()
