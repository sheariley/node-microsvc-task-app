import bodyParser from 'body-parser'
import express from 'express'
import fs from 'fs'
import https from 'https'
import mongoose from 'mongoose'
import { coalesceErrorMsg } from 'ms-task-app-common'
import { mapDtoValidationErrors, TaskInputDtoSchema, type TaskInputDto } from 'ms-task-app-dto'
import { TaskModel } from 'ms-task-app-entities'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import { authenticatedUser } from './lib/authenticated-user.ts'

// Server settings
const servicePort = 3002
const requireInternalMtls = Boolean(process.env.REQUIRE_INTERNAL_MTLS ?? false)

// DB and MQ settings
const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'
const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = Number(process.env.RABBITMQ_PORT ?? 5672)
const rabbitMQTaskCreatedQueueName = process.env.RABBITMQ_TASK_CREATED_QUEUE_NAME ?? 'task_created'
const rabbitMQTaskUpdatedQueueName = process.env.RABBITMQ_TASK_UPDATED_QUEUE_NAME ?? 'task_updated'

async function main() {
  const app = express()
  app.set('trust proxy', true)
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
    appName: 'task-service',
  }))!

  if (taskDbConError || !taskDbCon) {
    process.exit(1)
  }

  // used for container health-check
  app.get('/ping', async (req, res) => {
    res.status(200).json({ timestamp: Date.now() })
  })

  // Get User's Tasks
  app.get('/users/:userId/tasks', authenticatedUser, async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(req.params.userId)) {
        return res.status(404).json({ error: true, message: 'Not Found' })
      }

      if (req.params.userId !== res.locals.user?.id) {
        return res.status(403).json({ error: true, message: 'Unauthorized' })
      }

      const tasks = await TaskModel.find().where('userId').equals(req.params.userId)
      res.status(200).json(tasks)
    } catch (error) {
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  // Get a specific user's task by ID
  app.get('/users/:userId/tasks/:taskId', authenticatedUser, async (req, res) => {
    const { userId, taskId } = req.params
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
        return res.status(404)
      }

      if (req.params.userId !== res.locals.user?.id) {
        return res.status(403).json({ error: true, message: 'Unauthorized' })
      }

      const task = await TaskModel.findById(req.params.taskId)
        .where('userId')
        .equals(req.params.userId)
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

  // Create a task for a user
  app.post('/users/:userId/tasks', authenticatedUser, async (req, res) => {
    const { userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(404)
    }

    if (req.params.userId !== res.locals.user?.id) {
      return res.status(403).json({ error: true, message: 'Unauthorized' })
    }

    const inputDto = req.body as TaskInputDto

    const valResult = await TaskInputDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      return res.status(400).json({
        errors: mapDtoValidationErrors(valResult.error),
      })
    }

    const { title, description, completed } = inputDto
    try {
      const task = new TaskModel({ userId, title, description, completed, createdAt: new Date() })
      await task.save()

      if (!mqChannel) {
        return res.status(503).json({ error: true, message: 'RabbitMQ channel not connected' })
      } else {
        const taskCreatedMsg: TaskCreatedQueueMessage = {
          taskId: task._id.toString(),
          userId: userId!,
          title,
        }
        mqChannel.sendToQueue(
          rabbitMQTaskCreatedQueueName,
          Buffer.from(JSON.stringify(taskCreatedMsg))
        )
      }

      res.status(201).json(task)
    } catch (error) {
      console.error('Error saving: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  // Update a task for a user
  app.put('/users/:userId/tasks/:taskId', authenticatedUser, async (req, res) => {
    const { taskId, userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
      return res.status(404)
    }

    if (req.params.userId !== res.locals.user?.id) {
      return res.status(403).json({ error: true, message: 'Unauthorized' })
    }

    const inputDto = req.body as Partial<TaskInputDto>

    const valResult = await TaskInputDtoSchema.partial().safeParseAsync(inputDto)

    if (!valResult.success) {
      return res.status(400).json({
        errors: mapDtoValidationErrors(valResult.error),
      })
    }

    const { title, description, completed } = inputDto
    try {
      const task = await TaskModel.findByIdAndUpdate(
        taskId,
        { title, description, completed },
        { new: true }
      )
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
          userId: userId!,
          title: task.title,
          description: task.description,
          completed: task.completed,
        }
        mqChannel.sendToQueue(
          rabbitMQTaskUpdatedQueueName,
          Buffer.from(JSON.stringify(taskUpdatedMsg))
        )
      }

      console.log('Task updated successfully', task)
      res.status(204).send()
    } catch (error) {
      console.error('Error saving: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  // Delete a user's task
  app.delete('/users/:userId/tasks/:taskId', authenticatedUser, async (req, res) => {
    const { taskId, userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
      return res.status(404)
    }

    if (req.params.userId !== res.locals.user?.id) {
      return res.status(403).json({ error: true, message: 'Unauthorized' })
    }

    const task = await TaskModel.findByIdAndDelete(taskId).where('userId').equals(userId)

    if (!task) {
      return res.status(404).json({ error: true, message: 'Task not found' })
    }

    res.status(204).send()
  })

  if (requireInternalMtls) {
    const privateKeyPath =
      process.env.TASK_SVC_PRIVATE_KEY_PATH ?? '../../.certs/task-service/task-service.key.pem'
    const certFilePath =
      process.env.TASK_SVC_CERT_PATH ?? '../../.certs/task-service/task-service.cert.pem'
    const caCertPath = process.env.CA_CERT_PATH ?? '../../.certs/ca/ca.cert.pem'
    const httpsServerOptions: https.ServerOptions = {
      key: fs.readFileSync(privateKeyPath),
      cert: fs.readFileSync(certFilePath),
      ca: fs.readFileSync(caCertPath),
      requestCert: true, // request client cert
      rejectUnauthorized: true, // reject connections with invalid or missing client cert
    }
    https.createServer(httpsServerOptions, app).listen(servicePort, () => {
      console.log(`Task service listening on secure port ${servicePort}`)
    })
  } else {
    app.listen(servicePort, () => {
      console.log(`Task service listening on port ${servicePort}`)
    })
  }
}

main()
