import { coalesceErrorMsg } from 'ms-task-app-common'
import { UserModel } from 'ms-task-app-entities'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  type AccountLinkedQueueMessage,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import nodemailer from 'nodemailer'

const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'

const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = Number(process.env.RABBITMQ_PORT ?? 5672)
const rabbitMQTaskCreatedQueueName = process.env.RABBITMQ_TASK_CREATED_QUEUE_NAME ?? 'task_created'
const rabbitMQTaskUpdatedQueueName = process.env.RABBITMQ_TASK_UPDATED_QUEUE_NAME ?? 'task_updated'
const rabbitMQAccountLinkedQueueName =
  process.env.RABBITMQ_ACCOUNT_LINKED_QUEUE_NAME ?? 'account_linked'

const smtpHost = process.env.SMTP_HOST ?? 'smtp-server'
const smtpPort = Number(process.env.SMTP_PORT ?? 1025)
const smtpUser = process.env.SMTP_USER ?? 'maildevuser'
const smtpPass = process.env.SMTP_PASS ?? 'maildevpass'
const notifyFromEmail = process.env.NOTIFY_FROM_EMAIL ?? 'noreply@notification-service.local'

function createMailTransport() {
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })
}

async function main() {
  const {
    mqConnection,
    mqChannel,
    error: mqError,
  } = (await connectMQWithRetry({
    host: rabbitMQHost,
    port: rabbitMQPort,
  }))!

  if (mqError || !mqConnection || !mqChannel) {
    process.exit(1)
  }

  console.log('Asserting message queues...')
  await mqChannel.assertQueue(rabbitMQTaskCreatedQueueName)
  await mqChannel.assertQueue(rabbitMQTaskUpdatedQueueName)

  const { connection: userDbCon, error: userDbConError } = (await connectMongoDbWithRetry({
    host: mongoHost,
    port: mongoPort,
    dbName: 'oauth',
    appName: 'notification-service'
  }))!

  if (userDbConError || !userDbCon) {
    process.exit(1)
  }

  const mailTransport = createMailTransport()

  mqChannel.consume(rabbitMQTaskCreatedQueueName, async msg => {
    if (msg) {
      try {
        const payload: TaskCreatedQueueMessage = JSON.parse(msg.content.toString())
        console.log('Notification: TASK CREATED: ', payload)

        const user = await UserModel.findOne().where('_id').equals(payload.userId)

        if (!user) {
          throw new Error(
            `User with ID ${payload.userId} associated with task notification not found.`
          )
        }

        if (!user.email) {
          console.warn(
            `User with ID ${payload.userId} associated with task notification has no email address.`
          )
          mqChannel.nack(msg)
          return
        }

        const mailResult = await mailTransport.sendMail({
          from: notifyFromEmail,
          to: user.email,
          subject: 'A new task was created',
          text: `A new task was created for you! The title was "${payload.title}".`,
        })

        if (mailResult.messageId) {
          console.log(
            `Task creation email notification sent. TaskId: ${payload.taskId}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
          )
          mqChannel.ack(msg)
        }
      } catch (error) {
        const msg = coalesceErrorMsg(error)
        console.error('Error sending notification email: ', msg)
      }
    }
  })

  mqChannel.consume(rabbitMQTaskUpdatedQueueName, async msg => {
    if (msg) {
      try {
        const payload: TaskUpdatedQueueMessage = JSON.parse(msg.content.toString())
        console.log('Notification: TASK UPDATED: ', payload)

        const user = await UserModel.findOne().where('_id').equals(payload.userId)

        if (!user) {
          throw new Error(
            `User with ID ${payload.userId} associated with task notification not found.`
          )
        }

        if (!user.email) {
          console.warn(
            `User with ID ${payload.userId} associated with task notification has no email address.`
          )
          mqChannel.nack(msg)
          return
        }

        const mailResult = await mailTransport.sendMail({
          from: notifyFromEmail,
          to: user.email,
          subject: 'A task was updated',
          text: `The task titled "${payload.title}" was updated. Completed: ${payload.completed}`,
        })

        if (mailResult.messageId) {
          console.log(
            `Task update email notification sent. TaskId: ${payload.taskId}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
          )
          mqChannel.ack(msg)
        }
      } catch (error) {
        const msg = coalesceErrorMsg(error)
        console.error('Error sending notification email: ', msg)
      }
    }
  })

  mqChannel.consume(rabbitMQAccountLinkedQueueName, async msg => {
    if (msg) {
      try {
        const payload: AccountLinkedQueueMessage = JSON.parse(msg.content.toString())
        console.log('Notification: ACCOUNT LINKED: ', payload)

        const user = await UserModel.findOne().where('_id').equals(payload.userId)

        if (!user) {
          throw new Error(
            `User with ID ${payload.userId} associated with account notification not found.`
          )
        }

        if (!user.email) {
          console.warn(
            `User with ID ${payload.userId} associated with account notification has no email address.`
          )
          mqChannel.nack(msg)
          return
        }

        const mailResult = await mailTransport.sendMail({
          from: notifyFromEmail,
          to: user.email,
          subject: 'An account of yours was linked',
          text: `Your ${payload.provider} account was linked.`,
        })

        if (mailResult.messageId) {
          console.log(
            `Account link email notification sent. Provider: ${payload.provider}, UserId: ${payload.userId}, MessageId: ${mailResult.messageId}`
          )
          mqChannel.ack(msg)
        }
      } catch (error) {
        const msg = coalesceErrorMsg(error)
        console.error('Error sending notification email: ', msg)
      }
    }
  })
}

main()
