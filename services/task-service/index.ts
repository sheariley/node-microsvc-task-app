import bodyParser from 'body-parser'
import express from 'express'
import mongoose from 'mongoose'
import {
  coalesceErrorMsg,
  connectMongoDbWithRetry,
  connectMQWithRetry,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-shared'

const port = 3002
const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'

const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = Number(process.env.RABBITMQ_PORT ?? 5672)
const rabbitMQTaskCreatedQueueName = process.env.RABBITMQ_TASK_CREATED_QUEUE_NAME ?? 'task_created'
const rabbitMQTaskUpdatedQueueName = process.env.RABBITMQ_TASK_UPDATED_QUEUE_NAME ?? 'task_updated'

async function main() {
  const app = express()
  app.use(bodyParser.json())

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

  const { connection: taskDbCon, error: taskDbConError } = (await connectMongoDbWithRetry({
    host: mongoHost,
    port: mongoPort,
    dbName: 'tasks',
  }))!

  if (taskDbConError || !taskDbCon) {
    process.exit(1)
  }

  const TaskSchema = new taskDbCon.Schema({
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completed: Boolean,
  })

  const Task = taskDbCon.model('Task', TaskSchema)

  // used for container health-check
  app.get('/ping', async (req, res) => {
    res.status(200).json({ timestamp: Date.now() })
  })

  app.get('/users/:userId/tasks', async (req, res) => {
    try {
      const tasks = await Task.find().where('userId').equals(req.params.userId)
      res.json(tasks)
    } catch (error) {
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/users/:userId/tasks/:taskId', async (req, res) => {
    try {
      const task = await Task.findById(req.params.taskId).where('userId').equals(req.params.userId)
      if (!task) {
        return res.status(404).json({ error: true, message: 'Task not found' })
      } else {
        res.json(task)
      }
    } catch (error) {
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/users/:userId/tasks', async (req, res) => {
    const { userId } = req.params
    const { title, description, createdAt, completed } = req.body

    try {
      const task = new Task({ userId, title, description, createdAt, completed })
      await task.save()

      if (!mqChannel) {
        return res.status(503).json({ error: true, message: 'RabbitMQ channel not connected' })
      } else {
        const taskCreatedMsg: TaskCreatedQueueMessage = {
          taskId: task._id.toString(),
          userId,
          title,
        }
        mqChannel.sendToQueue(rabbitMQTaskCreatedQueueName, Buffer.from(JSON.stringify(taskCreatedMsg)))
      }

      res.status(201).json(task)
    } catch (error) {
      console.error('Error saving: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.put('/users/:userId/tasks/:taskId', async (req, res) => {
    const { taskId, userId } = req.params
    const { title, description, completed } = req.body

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
        const taskUpdatedMsg: TaskUpdatedQueueMessage = {
          taskId: task._id.toString(),
          userId,
          title: task.title,
          description: task.description,
          completed: task.completed,
        }
        mqChannel.sendToQueue(rabbitMQTaskUpdatedQueueName, Buffer.from(JSON.stringify(taskUpdatedMsg)))
      }

      console.log('Task updated successfully', task)
      res.status(204).send()
    } catch (error) {
      console.error('Error saving: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.listen(port, () => {
    console.log(`Task service listening on port ${port}`)
  })
}

main()
