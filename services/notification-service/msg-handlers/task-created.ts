import otel from '@opentelemetry/api'
import { getUserModel } from 'ms-task-app-entities'
import type { TaskCreatedQueueMessage } from 'ms-task-app-service-util'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import logger from '../lib/logger.ts'
import type { Mailer } from '../lib/mailer.ts'

export function createTaskCreatedMessageHandler(
  tracer: otel.Tracer,
  mailer: Mailer
) {
  return async (payload: TaskCreatedQueueMessage) => {
    const deferred = Promise.withResolvers<void>()

    logger.info('Notification: TASK CREATED: ', { payload })

    const userModel = getUserModel()

    const user = await userModel.findOne().where('_id').equals(payload.userId)

    if (!user) {
      throw new Error(`User with ID ${payload.userId} associated with task notification not found.`)
    }

    if (!user.email) {
      throw new Error(
        `User with ID ${payload.userId} associated with task notification has no email address.`
      )
    }

    const mailResult = await startSelfClosingActiveSpan(tracer, 'nodemailer.sendMail', () =>
      mailer.send(
        user.email,
        'A new task was created',
        `A new task was created for you! The title was "${payload.title}".`
      )
    )
    
    logger.info(
      `Task creation email notification sent. TaskId: ${payload.taskId}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
    )
    deferred.resolve()

    return deferred.promise
  }
}
