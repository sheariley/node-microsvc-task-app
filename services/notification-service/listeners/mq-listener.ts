import { coalesceError, getServerConfig, makeErrorSerializable } from 'ms-task-app-common'
import { reportExceptionIfActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import { connectMQWithRetry } from 'ms-task-app-service-util'
import logger from '../lib/logger.ts'
import type { MessageListenerOptions } from './listener-types.ts'

export async function startMqListener({ handlers, tracer }: MessageListenerOptions) {
  await tracer.startActiveSpan('start-mq-listener', async span => {
    try {
      const serverEnv = getServerConfig()

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

      const queueNames = Object.keys(handlers)
      for (let queueName of queueNames) {
        logger.info('Initializing MQ consumer', { queueName })
        mqChannel.consume(queueName, async msg => {
          if (msg) {
            try {
              const payload = JSON.parse(msg.content.toString())
              await handlers[queueName]!(payload)
              mqChannel.ack(msg)
            } catch (error) {
              try {
                mqChannel.nack(msg)
              } catch {
                // swallow
              }
              const coalescedError = coalesceError(error, 'Error sending notification email')
              reportExceptionIfActiveSpan(coalescedError)
              logger.error('Error sending notification email', {
                err: makeErrorSerializable(coalescedError),
                content: msg.content.toString(),
              })
            }
          }
        })
      }
    } catch (err) {
      const coalescedError = coalesceError(err)
      reportExceptionIfActiveSpan(coalescedError)
      logger.error('Error while starting MQ message listener', coalescedError)
    }
    span.end()
  })
}
