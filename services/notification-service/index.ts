import amqp from 'amqplib'
import type { TaskCreatedQueueMessage, TaskUpdatedQueueMessage } from 'ms-task-app-shared'

const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = process.env.RABBITMQ_PORT ?? 5672
const rabbitMQConString = `amqp://${rabbitMQHost}:${rabbitMQPort}`
const rabbitMQTaskCreatedQueueName = process.env.RABBITMQ_TASK_CREATED_QUEUE_NAME ?? 'task_created'
const rabbitMQTaskUpdatedQueueName = process.env.RABBITMQ_TASK_UPDATED_QUEUE_NAME ?? 'task_updated'

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

  mqChannel.consume(rabbitMQTaskCreatedQueueName, msg => {
    if (msg) {
      const taskData: TaskCreatedQueueMessage = JSON.parse(msg.content.toString())
      console.log('Notification: TASK CREATED: ', taskData)
      mqChannel.ack(msg)
    }
  })

  mqChannel.consume(rabbitMQTaskUpdatedQueueName, msg => {
    if (msg) {
      const taskData: TaskUpdatedQueueMessage = JSON.parse(msg.content.toString())
      console.log('Notification: TASK UPDATED: ', taskData)
      mqChannel.ack(msg)
    }
  })
}

main()