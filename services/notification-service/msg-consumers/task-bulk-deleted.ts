import otel from '@opentelemetry/api'
import { getUserModel } from 'ms-task-app-entities'
import type { MessageConsumer, TaskBulkBaseQueueMessage } from 'ms-task-app-service-util'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import logger from '../lib/logger.ts'
import type { Mailer } from '../lib/mailer.ts'

export function createTaskBulkDeletedMessageConsumer(
  tracer: otel.Tracer,
  mailer: Mailer
): MessageConsumer<TaskBulkBaseQueueMessage> {
  return async (payload: TaskBulkBaseQueueMessage) => {
    logger.debug('Notification: TASKS BULK DELETED', { payload })

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
        `${payload.taskIds.length} task(s) deleted`,
        `${payload.taskIds.length} task(s) deleted.`
      )
    )

    logger.debug(`Task bulk deletion email notification sent.`, {
      payload,
      messageId: mailResult.messageId,
    })
  }
}
