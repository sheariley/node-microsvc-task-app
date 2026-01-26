import './instrumentation.ts'

import otel from '@opentelemetry/api'
import {
  getServerConfig,
  makeErrorSerializable,
  redactedServerConfig
} from 'ms-task-app-common'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  type AccountLinkedQueueMessage,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import { reportExceptionIfActiveSpan } from 'ms-task-app-telemetry'

import logger from './lib/logger.ts'
import { createMailer } from './lib/mailer.ts'
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

      const {
        mqConnection,
        mqChannel,
        error: mqError,
      } = (await connectMQWithRetry({
        host: serverEnv.rabbitmq.host,
        port: serverEnv.rabbitmq.port,
        tls: serverEnv.disableInternalMtls ? undefined : serverEnv.notifySvc,
        logger,
      }))!

      if (mqError || !mqConnection || !mqChannel) {
        process.exit(1)
      }

      logger.info('Asserting message queues...')
      await tracer.startActiveSpan('rabbitmq-assert', async rabbitMqAssertSpan => {
        await mqChannel.assertQueue(serverEnv.rabbitmq.taskCreatedQueueName)
        await mqChannel.assertQueue(serverEnv.rabbitmq.taskUpdatedQueueName)
        await mqChannel.assertQueue(serverEnv.rabbitmq.accountLinkedQueueName)
        rabbitMqAssertSpan.end()
      })

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

      const handleTaskCreatedMsg = createTaskCreatedMessageHandler(tracer, mailer)
      const handleTaskUpdatedMsg = createTaskUpdatedMessageHandler(tracer, mailer)
      const handleAccountLinkedMsg = createAccountLinkedMessageHandler(tracer, mailer)

      mqChannel.consume(serverEnv.rabbitmq.taskCreatedQueueName, async msg => {
        if (msg) {
          try {
            const payload: TaskCreatedQueueMessage = JSON.parse(msg.content.toString())
            await handleTaskCreatedMsg(payload)
            mqChannel.ack(msg)
          } catch (error) {
            try {
              mqChannel.nack(msg)
            } catch {
              // swallow
            }
            let coercedError: Error
            if (error instanceof Error) coercedError = error
            else coercedError = new Error('Error sending notification email', { cause: error })

            reportExceptionIfActiveSpan(coercedError)
            logger.error('Error sending notification email', {
              error: makeErrorSerializable(coercedError),
              content: msg.content.toString(),
            })
          }
        }
      })

      mqChannel.consume(serverEnv.rabbitmq.taskUpdatedQueueName, async msg => {
        if (msg) {
          try {
            const payload: TaskUpdatedQueueMessage = JSON.parse(msg.content.toString())
            await handleTaskUpdatedMsg(payload)
            mqChannel.ack(msg)
          } catch (error) {
            try {
              mqChannel.nack(msg)
            } catch {
              // swallow
            }
            let coercedError: Error
            if (error instanceof Error) coercedError = error
            else coercedError = new Error('Error sending notification email', { cause: error })

            reportExceptionIfActiveSpan(coercedError)
            logger.error('Error sending notification email', {
              error: makeErrorSerializable(coercedError),
              content: msg.content.toString(),
            })
          }
        }
      })

      mqChannel.consume(serverEnv.rabbitmq.accountLinkedQueueName, async msg => {
        if (msg) {
          try {
            const payload: AccountLinkedQueueMessage = JSON.parse(msg.content.toString())
            await handleAccountLinkedMsg(payload)
            mqChannel.ack(msg)
          } catch (error) {
            try {
              mqChannel.nack(msg)
            } catch {
              // swallow
            }
            let coercedError: Error
            if (error instanceof Error) coercedError = error
            else coercedError = new Error('Error sending notification email', { cause: error })

            reportExceptionIfActiveSpan(coercedError)
            logger.error('Error sending notification email', {
              error: makeErrorSerializable(coercedError),
              content: msg.content.toString(),
            })
          }
        }
      })

      logger.info(`${serviceName} startup successful. Listening for messages...`)
    } catch (error) {
      let coercedError: Error
      if (error instanceof Error) coercedError = error
      else coercedError = new Error('Fatal exception during startup', { cause: error })

      logger.fatal('Fatal error during startup', coercedError)
      startupSpan.recordException(coercedError)
      startupSpan.end()
      process.exit(1)
    } finally {
      startupSpan.end()
    }
  })
}

main()
