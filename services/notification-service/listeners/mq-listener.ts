import { coalesceError, getServerConfig } from 'ms-task-app-common'
import { createPersistentMQClient } from 'ms-task-app-service-util'
import { reportExceptionIfActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import logger from '../lib/logger.ts'
import type { MessageListenerOptions } from './listener-options.ts'

export async function startMqListener({ consumers, tracer }: MessageListenerOptions) {
  await tracer.startActiveSpan('start-mq-listener', async span => {
    try {
      const serverEnv = getServerConfig()

      await createPersistentMQClient({
        host: serverEnv.rabbitmq.host,
        port: serverEnv.rabbitmq.port,
        tls: serverEnv.disableInternalMtls ? undefined : serverEnv.notifySvc,
        logger,
        consumers,
      })
    } catch (err) {
      const coalescedError = coalesceError(err)
      reportExceptionIfActiveSpan(coalescedError)
      logger.error('Error while starting MQ message listener', coalescedError)
    }
    span.end()
  })
}
