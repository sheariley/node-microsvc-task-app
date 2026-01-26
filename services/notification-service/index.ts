import './instrumentation.ts'

import otel from '@opentelemetry/api'
import {
  getServerConfig,
  makeErrorSerializable,
  redactedServerConfig,
  type TaskAppServerConfig,
} from 'ms-task-app-common'
import { getUserModel } from 'ms-task-app-entities'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  type AccountLinkedQueueMessage,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import { reportExceptionIfActiveSpan, startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import nodemailer from 'nodemailer'

import logger from './lib/logger.ts'

// Server settings
const serviceName = 'notification-service'

function createMailTransport({ host, port, user, pass }: TaskAppServerConfig['smtp']) {
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: {
      user,
      pass,
    },
  })
}

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

      const userModel = getUserModel()

      const mailTransport = await tracer.startActiveSpan(
        'mail-transport-init',
        async mailTransInitSpan => {
          logger.info('Creating mail transport...')
          const result = createMailTransport(serverEnv.smtp)
          mailTransInitSpan.end()
          return result
        }
      )

      mqChannel.consume(serverEnv.rabbitmq.taskCreatedQueueName, async msg => {
        if (msg) {
          try {
            const payload: TaskCreatedQueueMessage = JSON.parse(msg.content.toString())
            logger.info('Notification: TASK CREATED: ', { payload })

            const user = await userModel.findOne().where('_id').equals(payload.userId)

            if (!user) {
              throw new Error(
                `User with ID ${payload.userId} associated with task notification not found.`
              )
            }

            if (!user.email) {
              logger.warn(
                `User with ID ${payload.userId} associated with task notification has no email address.`
              )
              mqChannel.nack(msg)
              return
            }

            const mailResult = await startSelfClosingActiveSpan(tracer, 'nodemailer.sendMail', () =>
              mailTransport.sendMail({
                from: serverEnv.notifySvc.fromEmail,
                to: user.email,
                subject: 'A new task was created',
                text: `A new task was created for you! The title was "${payload.title}".`,
              })
            )

            if (mailResult.messageId) {
              logger.info(
                `Task creation email notification sent. TaskId: ${payload.taskId}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
              )
              mqChannel.ack(msg)
            }
          } catch (error) {
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
            logger.info('Notification: TASK UPDATED: ', { payload })

            const user = await userModel.findOne().where('_id').equals(payload.userId)

            if (!user) {
              throw new Error(
                `User with ID ${payload.userId} associated with task notification not found.`
              )
            }

            if (!user.email) {
              logger.warn(
                `User with ID ${payload.userId} associated with task notification has no email address.`
              )
              mqChannel.nack(msg)
              return
            }

            const mailResult = await startSelfClosingActiveSpan(tracer, 'nodemailer.sendMail', () =>
              mailTransport.sendMail({
                from: serverEnv.notifySvc.fromEmail,
                to: user.email,
                subject: 'A task was updated',
                text: `The task titled "${payload.title}" was updated. Completed: ${payload.completed}`,
              })
            )

            if (mailResult.messageId) {
              logger.info(
                `Task update email notification sent. TaskId: ${payload.taskId}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
              )
              mqChannel.ack(msg)
            }
          } catch (error) {
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
            logger.info('Notification: ACCOUNT LINKED: ', { payload })

            const user = await userModel.findOne().where('_id').equals(payload.userId)

            if (!user) {
              throw new Error(
                `User with ID ${payload.userId} associated with account notification not found.`
              )
            }

            if (!user.email) {
              logger.warn(
                `User with ID ${payload.userId} associated with account notification has no email address.`
              )
              mqChannel.nack(msg)
              return
            }

            const mailResult = await startSelfClosingActiveSpan(tracer, 'nodemailer.sendMail', () =>
              mailTransport.sendMail({
                from: serverEnv.notifySvc.fromEmail,
                to: user.email,
                subject: 'An account of yours was linked',
                text: `Your ${payload.provider} account was linked.`,
              })
            )

            if (mailResult.messageId) {
              logger.info(
                `Account link email notification sent. Provider: ${payload.provider}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
              )
              mqChannel.ack(msg)
            }
          } catch (error) {
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
