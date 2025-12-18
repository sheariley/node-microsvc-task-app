import express from 'express'
import mongoose from 'mongoose'
import bodyParser from 'body-parser'
import amqp from 'amqplib'
import type { TaskCreatedQueueMessage, TaskUpdatedQueueMessage } from 'ms-task-app-shared'

const port = 3002
const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'
const mongoConString = `mongodb://${mongoHost}:${mongoPort}/tasks`;
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
  const app = express()
  app.use(bodyParser.json())

  console.log(`Connecting to MongoDB at ${mongoConString}...`)
  try {
    await mongoose.connect(mongoConString)
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error: ', error);
    process.exit(1)
  }

  const TaskSchema = new mongoose.Schema({
    userId: String,
    title: String,
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    completed: Boolean,
  })

  const Task = mongoose.model('Task', TaskSchema)

  const { mqConnection, mqChannel } = (await connectRabbitMQWithRetry()) ?? {}

  if (!mqConnection) {
    console.error('Failed to connect to RabbitMQ!')
    process.exit(1)
  }

  if (!mqChannel) {
    console.error('Failed to open channel with RabbitMQ!')
    process.exit(1)
  }

  // used for container health-check
  app.get('/ping', async (req, res) => {
    res.status(200).json({ timestamp: Date.now() })
  })

  app.get('/users/:userId/tasks', async (req, res) => {
    try {
      const tasks = await Task.find()
        .where('userId')
        .equals(req.params.userId)
      res.json(tasks)
    } catch (error) {
      const reason = error instanceof Error ? error.message : (error as any).toString()
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/users/:userId/tasks/:taskId', async (req, res) => {
    try {
      const task = await Task.findById(req.params.taskId)
        .where('userId')
        .equals(req.params.userId)
      if (!task) {
        return res.status(404).json({ error: true, message: 'Task not found' })
      } else {
        res.json(task)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : (error as any).toString()
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/users/:userId/tasks', async (req, res) => {
    const {userId} = req.params
    const {title, description, createdAt, completed} = req.body

    try {
      const task = new Task({userId, title, description, createdAt, completed})
      await task.save()

      if (!mqChannel) {
        return res.status(503).json({ error: true, message: 'RabbitMQ channel not connected' })
      } else {
        const taskCreatedMsg: TaskCreatedQueueMessage = { taskId: task._id.toString(), userId, title }
        mqChannel.sendToQueue(rabbitMQTaskCreatedQueueName, Buffer.from(JSON.stringify(taskCreatedMsg)))
      }

      res.status(201).json(task)
    } catch(error) {
      const reason = error instanceof Error ? error.message : (error as any).toString()
      console.error('Error saving: ', error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.put('/users/:userId/tasks/:taskId', async (req, res) => {
    const {taskId, userId} = req.params
    const {title, description, completed} = req.body

    try {
      const task = await Task.findByIdAndUpdate(taskId, { title, description, completed })
        .where('userId')
        .equals(userId)
      
      if (!task) {
        return res.status(404).json({ error: true, message: 'Task not found' })
      }

      if (!mqChannel) {
        return res.status(503).json({ error: true, message: 'RabbitMQ channel not connected' })
      } else {
        const taskUpdatedMsg: TaskUpdatedQueueMessage = { taskId: task._id.toString(), userId, title, completed }
        mqChannel.sendToQueue(rabbitMQTaskUpdatedQueueName, Buffer.from(JSON.stringify(taskUpdatedMsg)))
      }
      
      console.log('Task updated successfully', task)
      res.status(204).send()
    } catch (error) {
      const reason = error instanceof Error ? error.message : (error as any).toString()
      console.error('Error saving: ', error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.listen(port, () => {
    console.log(`Task service listening on port ${port}`)
  })
}

main()
