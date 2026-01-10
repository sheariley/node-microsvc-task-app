import './instrumentation.ts'

import bodyParser from 'body-parser'
import express, { type RequestHandler } from 'express'
import type { Query } from 'express-serve-static-core'
import fs from 'fs'
import https from 'https'
import mongoose from 'mongoose'
import morgan from 'morgan'
import { checkClientCert } from 'ms-task-app-auth'
import { coalesceErrorMsg, getServerConfig, redactedServerConfig } from 'ms-task-app-common'
import { mapDtoValidationErrors, TaskInputDtoSchema, type TaskInputDto } from 'ms-task-app-dto'
import { TaskModel } from 'ms-task-app-entities'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  disableResponseCaching,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage
} from 'ms-task-app-service-util'
import { authenticatedUser } from './lib/authenticated-user.ts'
import type { BulkOpLocals, Locals } from './lib/express-types.ts'
import { validBulkOpParams } from './lib/valid-bulk-op-params.ts'

// Server settings
const servicePort = 3002

async function main() {
  const serverEnv = getServerConfig()
  console.info('Sever Config', redactedServerConfig(serverEnv))
  const app = express()

  app.set('trust proxy', true)
  app.set('etag', false)

  app.use(morgan('dev'))
  app.use(bodyParser.json())
  app.use(disableResponseCaching)

  const {
    mqConnection,
    mqChannel,
    error: mqError,
  } = (await connectMQWithRetry({
    host: serverEnv.rabbitmq.host,
    port: serverEnv.rabbitmq.port,
    tls: serverEnv.disableInternalMtls ? undefined : serverEnv.taskSvc,
  }))!

  if (mqError || !mqConnection || !mqChannel) {
    process.exit(1)
  }

  console.log('Asserting message queues...')
  await mqChannel.assertQueue(serverEnv.rabbitmq.taskCreatedQueueName)
  await mqChannel.assertQueue(serverEnv.rabbitmq.taskUpdatedQueueName)

  const { connection: taskDbCon, error: taskDbConError } = (await connectMongoDbWithRetry({
    host: serverEnv.mongodb.host,
    port: serverEnv.mongodb.port,
    dbName: 'tasks',
    appName: 'task-service',
    tls: serverEnv.disableInternalMtls
      ? undefined
      : {
          tlsCAFile: serverEnv.taskSvc.caCertPath,
          tlsCertificateKeyFile: serverEnv.taskSvc.keyCertComboPath,
        },
  }))!

  if (taskDbConError || !taskDbCon) {
    process.exit(1)
  }

  if (serverEnv.disableInternalMtls) {
    console.warn('Running without mTLS.')
  } else {
    const authorizedCNs: string[] = ['web-ui']
    app.use(
      checkClientCert(async ({ clientCert, req }) => {
        if (!clientCert) {
          console.warn(`Client cert not present for ${req.url}.`)
          return false
        }

        const authorized = !!clientCert && authorizedCNs.includes(clientCert.subject.CN)
        if (authorized) {
          console.info(`Client cert from ${clientCert.subject.CN} authorized to access ${req.url}.`)
        } else {
          console.warn(
            `Client cert from ${clientCert.subject.CN} NOT authorized to access ${req.url}.`
          )
        }
        return authorized
      })
    )
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
        return res.status(404).send()
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
      return res.status(404).send()
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
          serverEnv.rabbitmq.taskCreatedQueueName,
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

  const bulkUpdateCompleted = (
    completed: boolean
  ): RequestHandler<{ userId: string }, any, any, Query, Locals & BulkOpLocals> => {
    return async (req, res) => {
      const { userId } = req.params

      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(404).send()
      }

      if (req.params.userId !== res.locals.user?.id) {
        return res.status(403).json({ error: true, message: 'Unauthorized' })
      }

      const { matchedCount, modifiedCount } = await TaskModel.updateMany(
        {
          userId,
          _id: res.locals.taskIds,
        },
        {
          $set: { completed },
        }
      )

      if (!matchedCount) {
        return res.status(404).json({ error: true, message: 'Task(s) not found' })
      }

      res.status(200).json({ matchedCount, modifiedCount })
    }
  }

  // Mark multiple tasks complete for a user
  app.put(
    '/users/:userId/tasks/complete',
    authenticatedUser,
    validBulkOpParams,
    bulkUpdateCompleted(true)
  )

  // Mark multiple tasks incomplete for a user
  app.put(
    '/users/:userId/tasks/uncomplete',
    authenticatedUser,
    validBulkOpParams,
    bulkUpdateCompleted(false)
  )

  // Update a task for a user
  app.put('/users/:userId/tasks/:taskId', authenticatedUser, async (req, res) => {
    const { taskId, userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
      return res.status(404).send()
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
          serverEnv.rabbitmq.taskUpdatedQueueName,
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
      return res.status(404).send()
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

  // Delete multiple tasks for a user
  app.delete('/users/:userId/tasks', authenticatedUser, validBulkOpParams, async (req, res) => {
    const { userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(404).send()
    }

    if (req.params.userId !== res.locals.user?.id) {
      return res.status(403).json({ error: true, message: 'Unauthorized' })
    }

    const deleteResult = await TaskModel.deleteMany({
      userId,
      _id: res.locals.taskIds,
    })

    if (!deleteResult.deletedCount) {
      return res.status(404).json({ error: true, message: 'Task(s) not found' })
    }

    res.status(200).json({ deletedCount: deleteResult.deletedCount })
  })

  // Not found
  app.use((req, res) => {
    res.status(404).json({ error: true, message: 'Not found' })
  })

  // Start listening
  if (serverEnv.disableInternalMtls) {
    app.listen(servicePort, () => {
      console.log(`Task service listening on unsecure port ${servicePort}`)
    })
  } else {
    const httpsServerOptions: https.ServerOptions = {
      key: fs.readFileSync(serverEnv.taskSvc.privateKeyPath),
      cert: fs.readFileSync(serverEnv.taskSvc.certPath),
      ca: fs.readFileSync(serverEnv.taskSvc.caCertPath),
      requestCert: true, // request client cert
      rejectUnauthorized: true, // reject connections with invalid or missing client cert
    }
    https.createServer(httpsServerOptions, app).listen(servicePort, () => {
      console.log(`Task service listening on secure port ${servicePort}`)
    })
  }
}

main()
