import './instrumentation.ts'

import { MongoDBAdapter } from '@auth/mongodb-adapter'
import otel from '@opentelemetry/api'
import bodyParser from 'body-parser'
import express from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import fs from 'fs'
import https from 'https'
import { MongoClient, ServerApiVersion, type MongoClientOptions } from 'mongodb'
import mongoose from 'mongoose'
import { checkClientCert } from 'ms-task-app-auth'
import { getServerConfig, redactedServerConfig, type TaskAppServerConfig } from 'ms-task-app-common'
import {
  AccountInputDtoSchema,
  SessionInputDtoSchema,
  UserDtoSchema,
  VerificationTokenInputDtoSchema,
  type AccountInputDto,
} from 'ms-task-app-dto'
import {
  connectMQWithRetry,
  disableResponseCaching,
  handleUncaught,
  validInputDto,
  type AccountLinkedQueueMessage,
  type HandleUncaughtOptions,
  type InputDtoValidatorOptions,
} from 'ms-task-app-service-util'
import { reportExceptionIfActiveSpan, startSelfClosingActiveSpan } from 'ms-task-app-telemetry'
import { pinoHttp } from 'pino-http'
import type { ParsedQs } from 'qs'
import * as z from 'zod'

import logger from './lib/logger.ts'

// Server settings
const serviceName = 'oauth-service'
const servicePort = 3001

async function createMongoClient(serverEnv: TaskAppServerConfig) {
  const uri = `mongodb://${serverEnv.mongodb.host}:${serverEnv.mongodb.port}/oauth`
  const options: MongoClientOptions = {
    appName: 'oauth-service',
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    tls: true,
    tlsCAFile: serverEnv.oauthSvc.caCertPath,
    tlsCertificateKeyFile: serverEnv.oauthSvc.keyCertComboPath,
  }

  logger.info(`Connecting to MongoDB at ${uri}...`)
  try {
    const client = new MongoClient(uri, options)
    await client.connect()
    logger.info('Connected to MongoDB')
    return client
  } catch (error) {
    throw new Error('MongoDB connection failed', { cause: error })
  }
}

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
  }: Pick<
    HandleUncaughtOptions<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
    'req' | 'res' | 'defaultErrorMessage'
  >,
  handler: Function
) {
  return handleUncaught(
    {
      req,
      res,
      includeReason: true,
      beforeErrorRespond: (error, req) => {
        reportExceptionIfActiveSpan(error)
        logger.error({ error, params: req.params }, defaultErrorMessage)
      },
    },
    handler
  )
}

async function main() {
  // TODO: Pull service-version from package.json
  const tracer = otel.trace.getTracer(serviceName, '1.0.0')
  await tracer.startActiveSpan('service-startup', async startupSpan => {
    try {
      const serverEnv = getServerConfig()
      console.info('Sever Config', redactedServerConfig(serverEnv))

      const app = express()
      app.set('trust proxy', true)
      app.set('etag', false)
      app.use(
        pinoHttp({
          logger,
          wrapSerializers: false,
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
          tls: serverEnv.disableInternalMtls ? undefined : serverEnv.oauthSvc,
        })
      )

      if (mqError || !mqConnection || !mqChannel) {
        process.exit(1)
      }

      logger.info('Asserting message queues...')
      await startSelfClosingActiveSpan(
        tracer,
        'rabbitmq-assert',
        async () => await mqChannel.assertQueue(serverEnv.rabbitmq.accountLinkedQueueName)
      )

      const mongoAuthAdapter = await startSelfClosingActiveSpan(
        tracer,
        'mongodb-connect',
        async () => {
          const client = await createMongoClient(serverEnv)
          return MongoDBAdapter(client)
        }
      )

      if (serverEnv.disableInternalMtls) {
        logger.warn('Running without mTLS.')
      } else {
        logger.info('Initializing mTLS auth middleware...')
        await startSelfClosingActiveSpan(tracer, 'mtls-init', async () => {
          const authorizedCNs: string[] = [
            serviceName,
            'web-ui',
            'task-service',
            'notification-service',
          ]
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

      app.get('/users/by-email/:email', async (req, res) =>
        handleErrors({ req, res, defaultErrorMessage: 'Error getting user by email' }, async () => {
          const inputValResult = await startSelfClosingActiveSpan(
            tracer,
            'param-validation',
            async () => z.email().safeParse(req.params.email)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!inputValResult.success) {
            return res.status(404)
          }

          const result = await mongoAuthAdapter.getUserByEmail!(req.params.email)

          if (!result) {
            res
              .status(404)
              .json({ error: true, message: `User with email "${req.params.email}" not found` })
          } else {
            res.json(result)
          }
        })
      )

      app.get('/users/:userId', async (req, res) =>
        handleErrors({ req, res, defaultErrorMessage: 'Error getting user by ID' }, async () => {
          const { userId } = req.params

          const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
            mongoose.isValidObjectId(userId)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          const result = await mongoAuthAdapter.getUser!(userId)

          if (!result) {
            res.status(404).json({ error: true, message: `User with Id "${userId}" not found` })
          } else {
            res.status(200).json(result)
          }
        })
      )

      app.get('/providers/:provider/accounts/:providerAccountId/user', async (req, res) =>
        handleErrors(
          { req, res, defaultErrorMessage: 'Error fetching user by provider account' },
          async () => {
            const { provider, providerAccountId } = req.params

            const routeParamValResult = startSelfClosingActiveSpan(
              tracer,
              'param-validation',
              () => !!(provider && providerAccountId)
            )

            // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
            if (!routeParamValResult) {
              return res.status(404).send()
            }

            const result = await mongoAuthAdapter.getUserByAccount!({ provider, providerAccountId })

            if (!result) {
              res.status(404).json({
                error: true,
                message: `User with provider account "${provider}, ${providerAccountId}" not found`,
              })
            } else {
              res.status(200).json(result)
            }
          }
        )
      )

      app.post(
        '/users',
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: UserDtoSchema,
            validationErrorMsg: 'Create user input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors({ req, res, defaultErrorMessage: 'Error creating user' }, async () => {
            const result = await mongoAuthAdapter.createUser!(req.body)
            res.status(201).json(result)
          })
      )

      app.put(
        '/users/:userId',
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: UserDtoSchema,
            validationErrorMsg: 'Update user input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors({ req, res, defaultErrorMessage: 'Error updating user' }, async () => {
            const { userId } = req.params

            const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
              mongoose.isValidObjectId(userId)
            )

            // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
            if (!routeParamValResult) {
              return res.status(404).send()
            }

            const result = await mongoAuthAdapter.updateUser!(req.body)
            res.status(200).json(result)
          })
      )

      app.delete('/users/:userId', async (req, res) =>
        handleErrors({ req, res, defaultErrorMessage: 'Error deleting user' }, async () => {
          const { userId } = req.params
          const routeParamValResult = startSelfClosingActiveSpan(tracer, 'param-validation', () =>
            mongoose.isValidObjectId(userId)
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          const result = await mongoAuthAdapter.deleteUser!(userId)

          if (!result) {
            res
              .status(404)
              .json({ error: true, message: `User with Id "${req.params.userId}" not found` })
          } else {
            res.status(200).json(result)
          }
        })
      )

      app.post(
        '/providers/:provider/accounts/link',
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: AccountInputDtoSchema,
            inputDto: {
              ...req.body,
              provider: req.params.provider,
            },
            validationErrorMsg: 'Link account input validation failed',
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors(
            { req, res, defaultErrorMessage: 'Error linking account provider' },
            async () => {
              const inputDto = {
                ...req.body,
                provider: req.params.provider,
              } as AccountInputDto

              const result = await mongoAuthAdapter.linkAccount!(inputDto)
              res.status(201).json(result)

              // TODO: Add fault tolerance and fallback logic (send direct to notification service)
              const accountLinkedMsg: AccountLinkedQueueMessage = {
                provider: inputDto.provider,
                userId: inputDto.userId,
                scope: inputDto.scope,
              }
              try {
                mqChannel.sendToQueue(
                  serverEnv.rabbitmq.accountLinkedQueueName,
                  Buffer.from(JSON.stringify(accountLinkedMsg))
                )
              } catch (mqSendErr) {
                logger.warn(
                  { mqSendErr, accountLinkedMsg },
                  'Error sending account_linked message to queue'
                )
              }
            }
          )
      )

      app.delete('/providers/:provider/accounts/:providerAccountId/unlink', async (req, res) =>
        handleErrors(
          { req, res, defaultErrorMessage: 'Error unlinking provider account' },
          async () => {
            const { provider, providerAccountId } = req.params

            const routeParamValResult = startSelfClosingActiveSpan(
              tracer,
              'param-validation',
              () => !!(provider && providerAccountId)
            )

            // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
            if (!routeParamValResult) {
              return res.status(404).send()
            }

            const result = await mongoAuthAdapter.unlinkAccount!({ provider, providerAccountId })

            if (!result) {
              res.status(404).json({
                error: true,
                message: `Provider account "${provider}, ${providerAccountId}" not found`,
              })
            } else {
              res.json(result)
            }
          }
        )
      )

      app.get('/sessions/:sessionToken/with-user', async (req, res) =>
        handleErrors(
          { req, res, defaultErrorMessage: 'Error getting session and user' },
          async () => {
            const routeParamValResult = startSelfClosingActiveSpan(
              tracer,
              'param-validation',
              () => z.uuidv4().safeParse(req.params.sessionToken).success
            )

            // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
            if (!routeParamValResult) {
              return res.status(404).send()
            }

            const result = await mongoAuthAdapter.getSessionAndUser!(req.params.sessionToken)

            if (!result) {
              res.status(404).json({
                error: true,
                message: `Session with token "${req.params.sessionToken}" not found`,
              })
            } else {
              res.status(200).json(result)
            }
          }
        )
      )

      app.post(
        '/sessions',
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: SessionInputDtoSchema,
            validationErrorMsg: 'Create session input validation failed',
            onSucceed: data => (res.locals.parsedBody = data),
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors({ req, res, defaultErrorMessage: 'Error creating session' }, async () => {
            const result = await mongoAuthAdapter.createSession!(res.locals.parsedBody)
            res.status(201).json(result)
          })
      )

      app.put(
        '/sessions/:sessionToken',
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: SessionInputDtoSchema,
            validationErrorMsg: 'Update session input validation failed',
            onSucceed: data => (res.locals.parsedBody = data),
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors({ req, res, defaultErrorMessage: 'Error updating session' }, async () => {
            const routeParamValResult = startSelfClosingActiveSpan(
              tracer,
              'param-validation',
              () => z.uuidv4().safeParse(req.params.sessionToken).success
            )

            // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
            if (!routeParamValResult) {
              return res.status(404).send()
            }

            const result = await mongoAuthAdapter.updateSession!(res.locals.parsedBody)
            res.status(200).json(result)
          })
      )

      app.delete('/sessions/:sessionToken', async (req, res) =>
        handleErrors({ req, res, defaultErrorMessage: 'Error deleting session' }, async () => {
          const routeParamValResult = startSelfClosingActiveSpan(
            tracer,
            'param-validation',
            () => z.uuidv4().safeParse(req.params.sessionToken).success
          )

          // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
          if (!routeParamValResult) {
            return res.status(404).send()
          }

          const result = await mongoAuthAdapter.deleteSession!(req.params.sessionToken)

          if (!result) {
            res.status(404).json({
              error: true,
              message: `Session with token "${req.params.sessionToken}" not found`,
            })
          } else {
            res.status(200).json(result)
          }
        })
      )

      app.post(
        '/verification-tokens',
        async (req, res, next) =>
          validInputDto({
            req,
            res,
            next,
            schema: VerificationTokenInputDtoSchema,
            validationErrorMsg: 'Create verification token input validation failed',
            onSucceed: data => (res.locals.parsedBody = data),
            beforeErrorRespond: beforeValidationErrorRespond,
          }),
        async (req, res) =>
          handleErrors(
            { req, res, defaultErrorMessage: 'Error creating verification token' },
            async () => {
              const result = await mongoAuthAdapter.createVerificationToken!(res.locals.parsedBody)
              res.status(201).json(result)
            }
          )
      )

      app.delete('/verification-tokens/:identifier/use/:token', async (req, res) =>
        handleErrors(
          { req, res, defaultErrorMessage: 'Error using verification token' },
          async () => {
            const { identifier, token } = req.params

            const routeParamValResult = startSelfClosingActiveSpan(
              tracer,
              'param-validation',
              () => !!(identifier && token)
            )

            // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
            if (!routeParamValResult) {
              return res.status(404).send()
            }

            const result = await mongoAuthAdapter.useVerificationToken!({ identifier, token })

            if (!result) {
              res.status(404).json({ error: true, message: `Verification token not found` })
            } else {
              res.status(200).json(result)
            }
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
          try {
            if (error) {
              reportExceptionIfActiveSpan(error)
              logger.fatal(
                error,
                `Fatal error occurred while ${serviceName} attempted to listen on port ${servicePort}`
              )
            } else {
              logger.info(`${serviceName} listening on unsecure port ${servicePort}`)
            }
          } catch {
            // swallow
          }
          startupSpan.end()
        })
      } else {
        const httpsServerOptions: https.ServerOptions = {
          key: fs.readFileSync(serverEnv.oauthSvc.privateKeyPath),
          cert: fs.readFileSync(serverEnv.oauthSvc.certPath),
          ca: fs.readFileSync(serverEnv.oauthSvc.caCertPath),
          requestCert: true, // request client cert
          rejectUnauthorized: true, // reject connections with invalid or missing client cert
        }
        const server = https
          .createServer(httpsServerOptions, app)
          .listen(servicePort, () => {
            logger.info(`${serviceName} listening on secure port ${servicePort}`)
            startupSpan.end()
          })
          .once('error', err => {
            if (!server.listening) {
              logger.fatal(
                err,
                `Fatal error during startup, while attempting to listen on port ${servicePort}.`
              )
              startupSpan.end()
            }
          })
      }
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
