import amqp from 'amqplib'
import nodemailer from 'nodemailer'
import type { TaskCreatedQueueMessage, TaskUpdatedQueueMessage } from 'ms-task-app-shared'

const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = Number(process.env.RABBITMQ_PORT ?? 5672)
const rabbitMQConString = `amqp://${rabbitMQHost}:${rabbitMQPort}`
const rabbitMQTaskCreatedQueueName = process.env.RABBITMQ_TASK_CREATED_QUEUE_NAME ?? 'task_created'
const rabbitMQTaskUpdatedQueueName = process.env.RABBITMQ_TASK_UPDATED_QUEUE_NAME ?? 'task_updated'

const smtpHost = process.env.SMTP_HOST ?? 'smtp-server'
const smtpPort = Number(process.env.SMTP_PORT ?? 1025)
const smtpUser = process.env.SMTP_USER ?? 'maildevuser'
const smtpPass = process.env.SMTP_PASS ?? 'maildevpass'

async function connectRabbitMQWithRetry(retries = 5, delay = 3000) {
  while (retries) {
    try {
      const mqConnection = await amqp.connect(rabbitMQConString)
      const mqChannel = await mqConnection.createChannel()
      await mqChannel.assertQueue(rabbitMQTaskCreatedQueueName)
      await mqChannel.assertQueue(rabbitMQTaskUpdatedQueueName)
      console.log('Connected to RabbitMQ')
      return { mqConnection, mqChannel }
    } catch (error) {
      const msg = error instanceof Error ? error.message : (error as any).toString()
      console.log('RabbitMQ Connection Error: ', msg)
      retries--
      console.log('Retrying connection. Retries left: ', retries)
      // wait for specified delay
      await new Promise(res => setTimeout(res, delay))
    }
  }
}

function createMailTransport() {
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  })
}

async function main() {
  const { mqConnection, mqChannel } = (await connectRabbitMQWithRetry()) ?? {}

  if (!mqConnection) {
    console.error('Failed to connect to RabbitMQ!')
    process.exit(1)
  }

  if (!mqChannel) {
    console.error('Failed to open channel with RabbitMQ!')
    process.exit(1)
  }

  const mailTransport = createMailTransport()

  mqChannel.consume(rabbitMQTaskCreatedQueueName, async msg => {
    if (msg) {
      const taskData: TaskCreatedQueueMessage = JSON.parse(msg.content.toString())
      console.log('Notification: TASK CREATED: ', taskData)

      try {
        // TODO: Look up user by userId and get their email to be used in sending the email
        const mailResult = await mailTransport.sendMail({
          from: 'noreply@notification-service.local',
          to: 'user@task-service.local',
          subject: 'A new task was created',
          text: `A new task was created for you! The title was "${taskData.title}".`
        })

        if (mailResult.messageId) {
          console.log(`Task creation email notification sent. TaskId: ${taskData.taskId}, MessageId: ${mailResult.messageId}`)
          mqChannel.ack(msg)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : (error as any).toString()
        console.error('Error sending notification email: ', msg)
      }
    }
  })

  mqChannel.consume(rabbitMQTaskUpdatedQueueName, async msg => {
    if (msg) {
      const taskData: TaskUpdatedQueueMessage = JSON.parse(msg.content.toString())
      console.log('Notification: TASK UPDATED: ', taskData)

      try {
        // TODO: Look up user by userId and get their email to be used in sending the email
        const mailResult = await mailTransport.sendMail({
          from: 'noreply@notification-service.local',
          to: 'user@task-service.local',
          subject: 'A task was updated',
          text: `The task titled "${taskData.title}" was updated. Completed: ${taskData.completed}`
        })

        if (mailResult.messageId) {
          console.log(`Task update email notification sent. TaskId: ${taskData.taskId}, MessageId: ${mailResult.messageId}`)
          mqChannel.ack(msg)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : (error as any).toString()
        console.error('Error sending notification email: ', msg)
      }
    }
  })
}

main()