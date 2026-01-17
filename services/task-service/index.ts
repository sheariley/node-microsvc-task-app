import './instrumentation.ts'

import otel from '@opentelemetry/api'
import bodyParser from 'body-parser'
import express, { type RequestHandler } from 'express'
import type { ParamsDictionary, Query, Response } from 'express-serve-static-core'
import fs from 'fs'
import https from 'https'
import mongoose from 'mongoose'
import { checkClientCert } from 'ms-task-app-auth'
import {
  coalesceErrorMsg,
  getServerConfig,
  redactedServerConfig,
  type JsonValue,
} from 'ms-task-app-common'
import {
  mapDtoValidationErrors,
  TaskInputDtoSchema,
  type ApiErrorResponse,
  type TaskInputDto,
} from 'ms-task-app-dto'
import { TaskModel } from 'ms-task-app-entities'
import {
  connectMongoDbWithRetry,
  connectMQWithRetry,
  disableResponseCaching,
  handleUncaught,
  validInputDto,
  type HandleUncaughtOptions,
  type InputDtoValidatorOptions,
  type TaskCreatedQueueMessage,
  type TaskUpdatedQueueMessage,
} from 'ms-task-app-service-util'
import { reportExceptionIfActiveSpan, startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import { pinoHttp } from 'pino-http'

import type { ParsedQs } from 'qs'
import { authenticatedUser } from './lib/authenticated-user.ts'
import type { BulkOpLocals, Locals } from './lib/express-types.ts'
import logger from './lib/logger.ts'
import { validBulkOpParams } from './lib/valid-bulk-op-params.ts'

// Server settings
const serviceName = 'task-service'
const servicePort = 3002

// generic validation error logger
const beforeValidationErrorRespond: InputDtoValidatorOptions['beforeErrorRespond'] = ({
  result,
  inputDto,
}) => {
  logger.warn({ validationErrors: result.validationErrors, inputDto }, result.message)
}

function handleErrors<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  LocalsObj extends Record<string, any> = Record<string, any>,
>(
  {
    req,
    res,
    defaultErrorMessage,
    params,
  }: Pick<
    HandleUncaughtOptions<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
    'req' | 'res' | 'defaultErrorMessage'
  > & { params?: Record<string, JsonValue> },
  handler: Function
) {
  return handleUncaught(
    {
      req,
      res,
      includeReason: true,
      beforeErrorRespond: (error, req) => {
        reportExceptionIfActiveSpan(error)
        logger.error({ error, params: params || req.params }, defaultErrorMessage)
      },
    },
    handler
  )
}

async function main() {
  // TODO: Pull service-version from package.json
  const tracer = otel.trace.getTracer(serviceName, '1.0.0')
  await startSelfClosingActiveSpan(tracer, 'service-startup', async startupSpan => {
    try {
      const serverEnv = getServerConfig()
      console.info('Sever Config', redactedServerConfig(serverEnv))

      const app = express()
      app.set('trust proxy', true)
      app.set('etag', false)
      app.use(
        pinoHttp({
          logger,
          autoLogging: {
            ignore: req => req.url.includes('/ping'),
          },
        })
      )
      app.use(bodyParser.json())
      app.use(disableResponseCaching)

      const {
        mqConnection,
        mqChannel,
        error: mqError,
      } = await startSelfClosingActiveSpan(tracer, 'rabbitmq-connect', () =>
        connectMQWithRetry({
          host: serverEnv.rabbitmq.host,
          port: serverEnv.rabbitmq.port,
          tls: serverEnv.disableInternalMtls ? undefined : serverEnv.taskSvc,
        })
      )

      if (mqError || !mqConnection || !mqChannel) {
        process.exit(1)
      }

      logger.info('Asserting message queues...')
      await startSelfClosingActiveSpan(tracer, 'rabbitmq-assert', async () => {
        await mqChannel.assertQueue(serverEnv.rabbitmq.taskCreatedQueueName)
        await mqChannel.assertQueue(serverEnv.rabbitmq.taskUpdatedQueueName)
      })

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
          })
      )

      if (taskDbConError || !taskDbCon) {
        process.exit(1)
      }

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
              if (authorized) {
                logger.info(
                  `Client cert from ${clientCert.subject.CN} authorized to access ${req.url}.`
                )
              } else {
                logger.warn(
                  `Client cert from ${clientCert.subject.CN} NOT authorized to access ${req.url}.`
                )
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
      app.get(
        '/users/:userId/tasks',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res) =>
          handleErrors({ req, res, defaultErrorMessage: 'Error fetching user tasks' }, async () => {
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

            const tasks = await TaskModel.find().where('userId').equals(userId)
            res.status(200).json(tasks)
          })
      )

      // Get a specific user's task by ID
      app.get(
        '/users/:userId/tasks/:taskId',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res) =>
          handleErrors(
            { req, res, defaultErrorMessage: 'Error while fetching user task' },
            async () => {
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

              const task = await TaskModel.findById(req.params.taskId)
                .where('userId')
                .equals(req.params.userId)
              if (!task) {
                return res.status(404).json({ error: true, message: 'Task not found' })
              } else {
                res.json(task)
              }
            }
          )
      )

      // Create a task for a user
      app.post(
        '/users/:userId/tasks',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: TaskInputDtoSchema,
            validationErrorMsg: 'Create task input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors(
            { req, res, defaultErrorMessage: 'Error creating a user task' },
            async () => {
              const { userId } = req.params

              const routeParamValResult = startSelfClosingActiveSpan(
                tracer,
                'param-validation',
                () => mongoose.isValidObjectId(userId)
              )

              // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
              if (!routeParamValResult) {
                return res.status(404).send()
              }

              if (req.params.userId !== res.locals.user?.id) {
                return res.status(403).json({ error: true, message: 'Unauthorized' })
              }

              const { title, description, completed } = req.body as TaskInputDto

              const task = new TaskModel({
                userId,
                title,
                description,
                completed,
                createdAt: new Date(),
              })
              await task.save()

              // TODO: Add fault tolerance logic here
              if (!mqChannel) {
                return res
                  .status(503)
                  .json({ error: true, message: 'RabbitMQ channel not connected' })
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
            }
          )
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
        return async (req, res) =>
          handleErrors(
            {
              req,
              res,
              defaultErrorMessage: 'Error while bulk updating completion of user task(s)',
              params: {
                ...req.params,
                taskIds: res.locals.taskIds,
              },
            },
            async () => {
              const { userId } = req.params

              const routeParamValResult = startSelfClosingActiveSpan(
                tracer,
                'param-validation',
                () => mongoose.isValidObjectId(userId)
              )

              // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
              if (!routeParamValResult) {
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
          )
      }

      // Mark multiple tasks complete for a user
      app.put(
        '/users/:userId/tasks/complete',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res, next) => validBulkOpParams(tracer, req, res, next),
        bulkUpdateCompleted(true)
      )

      // Mark multiple tasks incomplete for a user
      app.put(
        '/users/:userId/tasks/uncomplete',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res, next) => validBulkOpParams(tracer, req, res, next),
        bulkUpdateCompleted(false)
      )

      // Update a task for a user
      app.put(
        '/users/:userId/tasks/:taskId',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: TaskInputDtoSchema,
            validationErrorMsg: 'Update task input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors({ req, res, defaultErrorMessage: 'Error updating user task' }, async () => {
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

            // TODO: Add fault tolerance logic here
            if (!mqChannel) {
              return res
                .status(503)
                .json({ error: true, message: 'RabbitMQ channel not connected' })
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

            logger.info({ task }, 'Task updated successfully')
            res.status(204).send()
          })
      )

      // Delete a user's task
      app.delete(
        '/users/:userId/tasks/:taskId',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (req, res) =>
          handleErrors(
            { req, res, defaultErrorMessage: 'Error while deleting user task' },
            async () => {
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

              const task = await TaskModel.findByIdAndDelete(taskId).where('userId').equals(userId)

              if (!task) {
                return res.status(404).json({ error: true, message: 'Task not found' })
              }

              res.status(204).send()
            }
          )
      )

      // Delete multiple tasks for a user
      app.delete(
        '/users/:userId/tasks',
        async (req, res, next) => authenticatedUser(tracer, req, res, next),
        async (
          req,
          res: Response<ApiErrorResponse | { deletedCount: number }, Locals & BulkOpLocals>,
          next
        ) => validBulkOpParams(tracer, req, res, next),
        async (
          req,
          res: Response<ApiErrorResponse | { deletedCount: number }, Locals & BulkOpLocals>
        ) =>
          handleErrors(
            {
              req,
              res,
              defaultErrorMessage: 'Error while deleting user tasks',
              params: {
                ...req.params,
                taskIds: res.locals.taskIds,
              },
            },
            async () => {
              const { userId } = req.params

              const routeParamValResult = startSelfClosingActiveSpan(
                tracer,
                'param-validation',
                () => mongoose.isValidObjectId(userId)
              )

              // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
              if (!routeParamValResult) {
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
            }
          )
      )

      // Not found
      app.use((req, res) => {
        res.status(404).json({ error: true, message: 'Not found' })
      })

      // Start listening
      if (serverEnv.disableInternalMtls) {
        app.listen(servicePort, error => {
          if (error) {
            reportExceptionIfActiveSpan(error)
            logger.fatal(
              { error },
              `Fatal error occurred while ${serviceName} attempted to listen on port ${servicePort}`
            )
          } else {
            logger.info(`${serviceName} listening on unsecure port ${servicePort}`)
          }
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
          logger.info(`${serviceName} listening on secure port ${servicePort}`)
        })
      }

      startupSpan.end()
    } catch (error) {
      let coercedError: Error
      if (error instanceof Error) coercedError = error
      else coercedError = new Error('Fatal exception during startup', { cause: error })

      logger.fatal(coercedError, 'Fatal error during startup')
      startupSpan.recordException(coercedError)
      startupSpan.end()
      process.exit(1)
    }
  })
}

main()
