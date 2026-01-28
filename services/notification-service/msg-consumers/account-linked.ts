import otel from '@opentelemetry/api'
import { getUserModel } from 'ms-task-app-entities'
import type { AccountLinkedQueueMessage, MessageConsumer } from 'ms-task-app-service-util'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry/instrumentation'

import logger from '../lib/logger.ts'
import type { Mailer } from '../lib/mailer.ts'

export function createAccountLinkedMessageHandler(
  tracer: otel.Tracer,
  mailer: Mailer
): MessageConsumer<AccountLinkedQueueMessage> {
  return async (payload: AccountLinkedQueueMessage) => {
    logger.info('Notification: ACCOUNT LINKED: ', { payload })

    const userModel = getUserModel()

    const user = await userModel.findOne().where('_id').equals(payload.userId)

    if (!user) {
      throw new Error(
        `User with ID ${payload.userId} associated with account notification not found.`
      )
    }

    if (!user.email) {
      throw new Error(
        `User with ID ${payload.userId} associated with account notification has no email address.`
      )
    }

    const mailResult = await startSelfClosingActiveSpan(tracer, 'Mailer.send', () =>
      mailer.send(
        user.email,
        'An account of yours was linked',
        `Your ${payload.provider} account was linked.`
      )
    )

    logger.info(`Account link email notification sent.`, {
      payload,
      messageId: mailResult.messageId,
    })
  }
}
