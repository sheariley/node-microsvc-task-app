import amqp from 'amqplib'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import { coalesceErrorMsg, wait, type TaskCreatedQueueMessage, type TaskUpdatedQueueMessage } from 'ms-task-app-shared'

const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'
const mongoConString = `mongodb://${mongoHost}:${mongoPort}/users`;

const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = Number(process.env.RABBITMQ_PORT ?? 5672)
const rabbitMQConString = `amqp://${rabbitMQHost}:${rabbitMQPort}`
const rabbitMQTaskCreatedQueueName = process.env.RABBITMQ_TASK_CREATED_QUEUE_NAME ?? 'task_created'
const rabbitMQTaskUpdatedQueueName = process.env.RABBITMQ_TASK_UPDATED_QUEUE_NAME ?? 'task_updated'

const smtpHost = process.env.SMTP_HOST ?? 'smtp-server'
const smtpPort = Number(process.env.SMTP_PORT ?? 1025)
const smtpUser = process.env.SMTP_USER ?? 'maildevuser'
const smtpPass = process.env.SMTP_PASS ?? 'maildevpass'
const notifyFromEmail = process.env.NOTIFY_FROM_EMAIL ?? 'noreply@notification-service.local'

async function connectRabbitMQWithRetry(retries = 5, delay = 3000) {
  // wait for specified delay to avoid connection errors during initialization
  await wait(delay)
  while (retries) {
    try {
      const mqConnection = await amqp.connect(rabbitMQConString)
      const mqChannel = await mqConnection.createChannel()
      await mqChannel.assertQueue(rabbitMQTaskCreatedQueueName)
      await mqChannel.assertQueue(rabbitMQTaskUpdatedQueueName)
      console.log('Connected to RabbitMQ')
      return { mqConnection, mqChannel }
    } catch (error) {
      const msg = coalesceErrorMsg(error)
      console.log('RabbitMQ Connection Error: ', msg)
      retries--
      console.log('Retrying connection. Retries left: ', retries)
      // wait for specified delay
      await wait(delay)
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

  console.log(`Connecting to MongoDB at ${mongoConString}...`)
  try {
    await mongoose.connect(mongoConString)
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error: ', error);
    process.exit(1)
  }

  const UserSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  })

  const User = mongoose.model('User', UserSchema)

  const mailTransport = createMailTransport()

  mqChannel.consume(rabbitMQTaskCreatedQueueName, async msg => {
    if (msg) {
      try {
        const taskData: TaskCreatedQueueMessage = JSON.parse(msg.content.toString())
        console.log('Notification: TASK CREATED: ', taskData)

        const user = await User.findOne().where('_id').equals(taskData.userId)
        
        if (!user) {
          throw new Error(`User with ID ${taskData.userId} associated with task notification not found.`)
        }

        if (!user.email) {
          console.warn(`User with ID ${taskData.userId} associated with task notification has no email address.`)
          mqChannel.nack(msg)
          return
        }

        const mailResult = await mailTransport.sendMail({
          from: notifyFromEmail,
          to: user.email,
          subject: 'A new task was created',
          text: `A new task was created for you! The title was "${taskData.title}".`
        })

        if (mailResult.messageId) {
          console.log(`Task creation email notification sent. TaskId: ${taskData.taskId}, MessageId: ${mailResult.messageId}`)
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
        const taskData: TaskUpdatedQueueMessage = JSON.parse(msg.content.toString())
        console.log('Notification: TASK UPDATED: ', taskData)

        const user = await User.findOne().where('_id').equals(taskData.userId)
        
        if (!user) {
          throw new Error(`User with ID ${taskData.userId} associated with task notification not found.`)
        }

        if (!user.email) {
          console.warn(`User with ID ${taskData.userId} associated with task notification has no email address.`)
          mqChannel.nack(msg)
          return
        }

        const mailResult = await mailTransport.sendMail({
          from: notifyFromEmail,
          to: user.email,
          subject: 'A task was updated',
          text: `The task titled "${taskData.title}" was updated. Completed: ${taskData.completed}`
        })

        if (mailResult.messageId) {
          console.log(`Task update email notification sent. TaskId: ${taskData.taskId}, MessageId: ${mailResult.messageId}`)
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