import otel from '@opentelemetry/api'
import { getUserModel } from 'ms-task-app-entities'
import type { MessageConsumer, TaskUpdatedQueueMessage } from 'ms-task-app-service-util'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import logger from '../lib/logger.ts'
import type { Mailer } from '../lib/mailer.ts'

export function createTaskUpdatedMessageConsumer(
  tracer: otel.Tracer,
  mailer: Mailer
): MessageConsumer<TaskUpdatedQueueMessage> {
  return async (payload: TaskUpdatedQueueMessage) => {
    logger.debug('Notification: TASK UPDATED: ', { payload })

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
        'A task was updated',
        `The task titled "${payload.title}" was updated. Completed: ${payload.completed}`
      )
    )

    logger.debug(`Task update email notification sent.`, {
      payload,
      messageId: mailResult.messageId,
    })
  }
}
