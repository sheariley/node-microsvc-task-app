import './instrumentation.ts'

import otel from '@opentelemetry/api'
import bodyParser from 'body-parser'
import express, { type RequestHandler } from 'express'
import type { Query, Response } from 'express-serve-static-core'
import mongoose from 'mongoose'
import { checkClientCert } from 'ms-task-app-auth'
import { getServerConfig, redactedServerConfig, type JsonValue } from 'ms-task-app-common'
import { TaskInputDtoSchema, type ApiErrorResponse, type TaskInputDto } from 'ms-task-app-dto'
import { getTaskModel } from 'ms-task-app-entities'
import {
  ApiUncaughtHandler,
  connectMongoDbWithRetry,
  createNotificationClient,
  disableResponseCaching,
  startMtlsHttpServer,
  validInputDto,
  type InputDtoValidatorOptions,
  type TaskBaseQueueMessage,
  type TaskBulkBaseQueueMessage,
  type TaskBulkUpdateCompletedQueueName,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import { startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import { pinoHttp } from 'pino-http'

import { authenticatedUser } from './lib/authenticated-user.ts'
import type { BulkOpLocals, Locals } from './lib/express-types.ts'
import logger from './lib/logger.ts'
import { validBulkOpParams } from './lib/valid-bulk-op-params.ts'

// Server settings
const serviceName = 'task-service'

// generic validation error logger
const beforeValidationErrorRespond: InputDtoValidatorOptions['beforeErrorRespond'] = ({
  result,
  inputDto,
}) => {
  logger.warn(result.message, {
    validationErrors: result.validationErrors,
    inputDto: inputDto as JsonValue,
  })
}

async function main() {
  process.on('uncaughtException', err => {
    logger.fatal('Uncaught error', err)
    process.exit(1)
  })

  // TODO: Pull service-version from package.json
  const tracer = otel.trace.getTracer(serviceName, '1.0.0')
  await tracer.startActiveSpan('service-startup', async startupSpan => {
    try {
      const serverEnv = getServerConfig()
      console.info('Sever Config', redactedServerConfig(serverEnv))

      const servicePort = serverEnv.taskSvc.port

      const app = express()
      app.set('trust proxy', true)
      app.set('etag', false)
      app.use(
        pinoHttp({
          logger: logger.pinoInstance,
          wrapSerializers: false,
          autoLogging: {
            ignore: req => req.url.includes('/ping'),
          },
        })
      )
      app.set('logger', logger)
      app.set('tracer', tracer)
      app.use(bodyParser.json())
      app.use(disableResponseCaching)

      logger.info('Creating notification client')
      const notificationClient = await startSelfClosingActiveSpan(
        tracer,
        'create-notification-client',
        () =>
          createNotificationClient({
            mqHost: serverEnv.rabbitmq.host,
            mqPort: serverEnv.rabbitmq.port,
            queueNames: [
              serverEnv.rabbitmq.taskCreatedQueueName,
              serverEnv.rabbitmq.taskUpdatedQueueName,
              serverEnv.rabbitmq.taskDeletedQueueName,
              serverEnv.rabbitmq.taskBulkDeletedQueueName,
              serverEnv.rabbitmq.taskBulkUpdateCompletedQueueName
            ],
            failover: {
              httpHost: serverEnv.notifySvc.host,
              httpPort: serverEnv.notifySvc.port,
            },
            tls: serverEnv.disableInternalMtls ? undefined : serverEnv.taskSvc,
            logger,
          })
      )

      const { connection: taskDbCon, error: taskDbConError } = await startSelfClosingActiveSpan(
        tracer,
        'mongodb-connect',
        () =>
          connectMongoDbWithRetry({
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
            logger,
          })
      )

      if (taskDbConError || !taskDbCon) {
        process.exit(1)
      }

      const taskModel = getTaskModel()

      if (serverEnv.disableInternalMtls) {
        logger.warn('Running without mTLS.')
      } else {
        logger.info('Initializing mTLS auth middleware...')
        startSelfClosingActiveSpan(tracer, 'mtls-init', () => {
          const authorizedCNs: string[] = [serviceName, 'web-ui']
          app.use(
            checkClientCert(async ({ clientCert, req }) => {
              if (!clientCert) {
                logger.warn(`Client cert not present for ${req.url}.`)
                return false
              }

              const authorized = !!clientCert && authorizedCNs.includes(clientCert.subject.CN)
              if (!req.url.startsWith('/ping')) {
                if (authorized) {
                  logger.info(
                    `Client cert from ${clientCert.subject.CN} authorized to access ${req.url}.`
                  )
                } else {
                  logger.warn(
                    `Client cert from ${clientCert.subject.CN} NOT authorized to access ${req.url}.`
                  )
                }
              }
              return authorized
            })
          )
        })
      }

      // used for container health-check
      app.get('/ping', async (req, res) => {
        res.status(200).json({ timestamp: Date.now() })
      })

      // Get User's Tasks
      app.get('/users/:userId/tasks', authenticatedUser, async (req, res) => {
        const { userId } = req.params
        const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
          mongoose.isValidObjectId(userId)
        )

        // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
        if (!routeParamValResult) {
          return res.status(404).json({ error: true, message: 'Not Found' })
        }

        if (req.params.userId !== res.locals.user?.id) {
          return res.status(403).json({ error: true, message: 'Unauthorized' })
        }

        const tasks = await taskModel.find().where('userId').equals(userId)
        res.status(200).json(tasks)
      })

      // Get a specific user's task by ID
      app.get('/users/:userId/tasks/:taskId', authenticatedUser, async (req, res) => {
        const { userId, taskId } = req.params
        const routeParamValResult = startSelfClosingActiveSpan(
          tracer,
          'param-validation',
          () => mongoose.isValidObjectId(userId) && mongoose.isValidObjectId(taskId)
        )

        // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
        if (!routeParamValResult) {
          return res.status(404).send()
        }

        if (req.params.userId !== res.locals.user?.id) {
          return res.status(403).json({ error: true, message: 'Unauthorized' })
        }

        const task = await taskModel
          .findById(req.params.taskId)
          .where('userId')
          .equals(req.params.userId)
        if (!task) {
          return res.status(404).json({ error: true, message: 'Task not found' })
        } else {
          res.json(task)
        }
      })

      // Create a task for a user
      app.post(
        '/users/:userId/tasks',
        authenticatedUser,
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: TaskInputDtoSchema,
            validationErrorMsg: 'Create task input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
            logger,
          }),
        async (req, res) => {
          const { userId } = req.params

          const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
            mongoose.isValidObjectId(userId)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          if (req.params.userId !== res.locals.user?.id) {
            return res.status(403).json({ error: true, message: 'Unauthorized' })
          }

          const { title, description, completed } = req.body as TaskInputDto

          const task = new taskModel({
            userId,
            title,
            description,
            completed,
            createdAt: new Date(),
          })
          await task.save()

          const taskCreatedMsg: TaskBaseQueueMessage = {
            taskId: task._id.toString(),
            userId: userId!,
            title,
          }
          notificationClient.send(serverEnv.rabbitmq.taskCreatedQueueName, taskCreatedMsg)

          res.status(201).json(task)
        }
      )

      const bulkUpdateCompleted = (
        completed: boolean
      ): RequestHandler<
        { userId: string },
        ApiErrorResponse | { matchedCount: number; modifiedCount: number },
        any,
        Query,
        Locals & BulkOpLocals
      > => {
        return async (req, res) => {
          const { userId } = req.params

          const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
            mongoose.isValidObjectId(userId)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          if (req.params.userId !== res.locals.user?.id) {
            return res.status(403).json({ error: true, message: 'Unauthorized' })
          }

          const { matchedCount, modifiedCount } = await taskModel.updateMany(
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

          const bulkUpdatedMsg: TaskBulkUpdateCompletedQueueName = {
            completed,
            userId,
            taskIds: res.locals.taskIds
          }
          notificationClient.send(serverEnv.rabbitmq.taskBulkUpdateCompletedQueueName, bulkUpdatedMsg)
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
      app.put(
        '/users/:userId/tasks/:taskId',
        authenticatedUser,
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: TaskInputDtoSchema,
            validationErrorMsg: 'Update task input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
            logger,
          }),
        async (req, res) => {
          const { taskId, userId } = req.params

          const routeParamValResult = startSelfClosingActiveSpan(
            tracer,
            'param-validation',
            () => mongoose.isValidObjectId(userId) && mongoose.isValidObjectId(taskId)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          if (req.params.userId !== res.locals.user?.id) {
            return res.status(403).json({ error: true, message: 'Unauthorized' })
          }

          const { title, description, completed } = req.body as Partial<TaskInputDto>
          const task = await taskModel
            .findByIdAndUpdate(taskId, { title, description, completed }, { new: true })
            .where('userId')
            .equals(userId)

          if (!task) {
            return res.status(404).json({ error: true, message: 'Task not found' })
          }

          const taskUpdatedMsg: TaskUpdatedQueueMessage = {
            taskId: task._id.toString(),
            userId: userId!,
            title: task.title,
            description: task.description,
            completed: task.completed,
          }
          notificationClient.send(serverEnv.rabbitmq.taskUpdatedQueueName, taskUpdatedMsg)

          res.status(204).send()
        }
      )

      // Delete a user's task
      app.delete('/users/:userId/tasks/:taskId', authenticatedUser, async (req, res) => {
        const { taskId, userId } = req.params

        const routeParamValResult = startSelfClosingActiveSpan(
          tracer,
          'param-validation',
          () => mongoose.isValidObjectId(userId) && mongoose.isValidObjectId(taskId)
        )

        // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
        if (!routeParamValResult) {
          return res.status(404).send()
        }

        if (req.params.userId !== res.locals.user?.id) {
          return res.status(403).json({ error: true, message: 'Unauthorized' })
        }

        const task = await taskModel.findByIdAndDelete(taskId).where('userId').equals(userId)

        if (!task) {
          return res.status(404).json({ error: true, message: 'Task not found' })
        }

        res.status(204).send()

        const taskDeletedMsg: TaskBaseQueueMessage = {
          taskId: task._id.toString(),
          title: task.title,
          userId: userId!,
        }
        notificationClient.send(serverEnv.rabbitmq.taskDeletedQueueName, taskDeletedMsg)
      })

      // Delete multiple tasks for a user
      app.delete(
        '/users/:userId/tasks',
        authenticatedUser,
        validBulkOpParams,
        async (
          req,
          res: Response<ApiErrorResponse | { deletedCount: number }, Locals & BulkOpLocals>
        ) => {
          const { userId } = req.params

          const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
            mongoose.isValidObjectId(userId)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          if (req.params.userId !== res.locals.user?.id) {
            return res.status(403).json({ error: true, message: 'Unauthorized' })
          }

          const deleteResult = await taskModel.deleteMany({
            userId,
            _id: res.locals.taskIds,
          })

          if (!deleteResult.deletedCount) {
            return res.status(404).json({ error: true, message: 'Task(s) not found' })
          }

          res.status(200).json({ deletedCount: deleteResult.deletedCount })
          
          const bulkDeletedMsg: TaskBulkBaseQueueMessage = {
            userId,
            taskIds: res.locals.taskIds
          }
          notificationClient.send(serverEnv.rabbitmq.taskBulkDeletedQueueName, bulkDeletedMsg)
        }
      )

      // Not found
      app.use((req, res) => {
        res.status(404).json({ error: true, message: 'Not found' })
      })

      app.use(ApiUncaughtHandler)

      // Start listening
      await startMtlsHttpServer(app, {
        disableMtls: serverEnv.disableInternalMtls,
        port: serverEnv.taskSvc.port,
        privateKeyPath: serverEnv.taskSvc.privateKeyPath,
        certPath: serverEnv.taskSvc.certPath,
        caCertPath: serverEnv.taskSvc.caCertPath,
        requestCert: true,
        rejectUnauthorized: true,
      })

      logger.info(
        `${serviceName} listening on ${serverEnv.disableInternalMtls ? '' : 'secure '}port ${servicePort}`
      )
      startupSpan.end()
    } catch (error) {
      let coercedError: Error
      if (error instanceof Error) coercedError = error
      else coercedError = new Error('Fatal exception during startup', { cause: error })

      logger.fatal('Fatal error during startup', coercedError)
      startupSpan.recordException(coercedError)
      startupSpan.end()
      process.exit(1)
    }
  })
}

main()
