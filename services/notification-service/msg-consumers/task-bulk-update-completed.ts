import otel from '@opentelemetry/api'
import { getUserModel } from 'ms-task-app-entities'
import type { MessageConsumer, TaskBulkUpdateCompletedQueueName } from 'ms-task-app-service-util'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import logger from '../lib/logger.ts'
import type { Mailer } from '../lib/mailer.ts'

export function createTaskBulkUpdateCompletedMessageConsumer(
  tracer: otel.Tracer,
  mailer: Mailer
): MessageConsumer<TaskBulkUpdateCompletedQueueName> {
  return async (payload: TaskBulkUpdateCompletedQueueName) => {
    logger.debug('Notification: TASKS BULK UPDATE COMPLETED', { payload })

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
        `${payload.taskIds.length} task(s) marked ${payload.completed ? 'complete' : 'incomplete'}`,
        `${payload.taskIds.length} task(s) marked ${payload.completed ? 'complete' : 'incomplete'}.`
      )
    )

    logger.debug(`Task bulk update completed email notification sent.`, {
      payload,
      messageId: mailResult.messageId,
    })
  }
}
