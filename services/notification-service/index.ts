import {
  coalesceErrorMsg,
  redactedServerConfig,
  getServerConfig,
  type TaskAppServerConfig,
} from 'ms-task-app-common'
import { UserModel } from 'ms-task-app-entities'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  type AccountLinkedQueueMessage,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import nodemailer from 'nodemailer'

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
  const serverEnv = getServerConfig()
  console.info('Sever Config', redactedServerConfig(serverEnv))
  const {
    mqConnection,
    mqChannel,
    error: mqError,
  } = (await connectMQWithRetry({
    host: serverEnv.rabbitmq.host,
    port: serverEnv.rabbitmq.port,
  }))!

  if (mqError || !mqConnection || !mqChannel) {
    process.exit(1)
  }

  console.log('Asserting message queues...')
  await mqChannel.assertQueue(serverEnv.rabbitmq.taskCreatedQueueName)
  await mqChannel.assertQueue(serverEnv.rabbitmq.taskUpdatedQueueName)
  await mqChannel.assertQueue(serverEnv.rabbitmq.accountLinkedQueueName)

  const { connection: userDbCon, error: userDbConError } = (await connectMongoDbWithRetry({
    host: serverEnv.mongodb.host,
    port: serverEnv.mongodb.port,
    dbName: 'oauth',
    appName: 'notification-service',
    tls: serverEnv.disableInternalMtls ? undefined : {
      tlsCAFile: serverEnv.notifySvc.caCertPath,
      tlsCertificateKeyFile: serverEnv.notifySvc.keyCertComboPath
    }
  }))!

  if (userDbConError || !userDbCon) {
    process.exit(1)
  }

  const mailTransport = createMailTransport(serverEnv.smtp)

  mqChannel.consume(serverEnv.rabbitmq.taskCreatedQueueName, async msg => {
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
          from: serverEnv.notifySvc.fromEmail,
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

  mqChannel.consume(serverEnv.rabbitmq.taskUpdatedQueueName, async msg => {
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
          from: serverEnv.notifySvc.fromEmail,
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

  mqChannel.consume(serverEnv.rabbitmq.accountLinkedQueueName, async msg => {
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
          from: serverEnv.notifySvc.fromEmail,
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
