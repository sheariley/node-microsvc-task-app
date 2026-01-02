import { MongoDBAdapter } from '@auth/mongodb-adapter'
import bodyParser from 'body-parser'
import express from 'express'
import fs from 'fs'
import https from 'https'
import { MongoClient, ServerApiVersion, type MongoClientOptions } from 'mongodb'
import mongoose from 'mongoose'
import morgan from 'morgan'
import { checkClientCert } from 'ms-task-app-auth'
import { coalesceErrorMsg } from 'ms-task-app-common'
import {
  AccountInputDtoSchema,
  mapDtoValidationErrors,
  SessionInputDtoSchema,
  UserDtoSchema,
  VerificationTokenInputDtoSchema,
  type AccountInputDto,
  type SessionInputDto,
  type UserDto,
  type VerificationTokenInputDto,
} from 'ms-task-app-dto'
import { connectMQWithRetry, type AccountLinkedQueueMessage } from 'ms-task-app-service-util'
import * as z from 'zod'

// Server settings
const servicePort = 3001
const disableInternalMtls = process.env.DISABLE_INTERNAL_MTLS === 'true'

// DB and MQ settings
const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'
const rabbitMQHost = process.env.RABBITMQ_HOST || 'rabbitmq'
const rabbitMQPort = Number(process.env.RABBITMQ_PORT ?? 5672)
const rabbitMQAccountLinkedQueueName =
  process.env.RABBITMQ_ACCOUNT_LINKED_QUEUE_NAME ?? 'account_linked'

function createMongoClient() {
  const uri = `mongodb://${mongoHost}:${mongoPort}/oauth`
  const options: MongoClientOptions = {
    appName: 'oauth-service',
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }

  return new MongoClient(uri, options)
}

async function main() {
  const app = express()
  app.set('trust proxy', true)
  app.use(morgan('dev'))
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
  await mqChannel.assertQueue(rabbitMQAccountLinkedQueueName)

  const client = createMongoClient()
  const mongoAuthAdapter = MongoDBAdapter(client)

  if (disableInternalMtls) {
    console.warn('Running without mTLS.')
  } else {
    const authorizedCNs: string[] = ['web-ui', 'task-service', 'notification-service']
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

  app.get('/users/by-email/:email', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!z.email().safeParse(req.params.email).success) {
        return res.status(404)
      }

      const result = await mongoAuthAdapter.getUserByEmail!(req.params.email)

      if (!result) {
        res.status(404).json({ error: `User with email "${req.params.email}" not found` })
      } else {
        res.json(result)
      }
    } catch (error) {
      console.error('Error fetching user by email: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/users/:userId', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(req.params.userId)) {
        return res.status(404)
      }

      const result = await mongoAuthAdapter.getUser!(req.params.userId)

      if (!result) {
        res.status(404).json({ error: `User with Id "${req.params.userId}" not found` })
      } else {
        res.status(200).json(result)
      }
    } catch (error) {
      console.error('Error fetching user: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/providers/:provider/accounts/:providerAccountId/user', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!req.params.provider || !req.params.providerAccountId) {
        return res.status(404)
      }
      const { provider, providerAccountId } = req.params

      const result = await mongoAuthAdapter.getUserByAccount!({ provider, providerAccountId })

      if (!result) {
        res.status(404).json({
          error: `User with provider account "${provider}, ${providerAccountId}" not found`,
        })
      } else {
        res.json(result)
      }
    } catch (error) {
      console.error('Error fetching user by provider account: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/users', async (req, res) => {
    const inputDto = req.body as UserDto

    const valResult = await UserDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      const validationErrors = mapDtoValidationErrors(valResult.error)
      console.warn('Create user input validation failed', validationErrors, inputDto)
      return res.status(400).json({
        errors: validationErrors,
      })
    }

    try {
      const result = await mongoAuthAdapter.createUser!(inputDto)
      res.status(201).json(result)
    } catch (error) {
      console.error('Error creating user: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.put('/users/:userId', async (req, res) => {
    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(404)
    }

    const inputDto = req.body as UserDto

    const valResult = await UserDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      return res.status(400).json({
        errors: mapDtoValidationErrors(valResult.error),
      })
    }

    try {
      const result = await mongoAuthAdapter.updateUser!(inputDto)
      res.status(200).json(result)
    } catch (error) {
      console.error('Error updating user: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.delete('/users/:userId', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(req.params.userId)) {
        return res.status(404)
      }

      const result = await mongoAuthAdapter.deleteUser!(req.params.userId)

      if (!result) {
        res.status(404).json({ error: `User with Id "${req.params.userId}" not found` })
      } else {
        res.status(200).json(result)
      }
    } catch (error) {
      console.error('Error deleting user: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/providers/:provider/accounts/link', async (req, res) => {
    const inputDto = {
      ...req.body,
      provider: req.params.provider,
    } as AccountInputDto

    const valResult = await AccountInputDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      const validationErrors = mapDtoValidationErrors(valResult.error)
      console.warn('Link account input validation failed', {
        url: req.url,
        validationErrors,
        inputDto,
      })
      return res.status(400).json({
        errors: validationErrors,
      })
    }

    try {
      const result = await mongoAuthAdapter.linkAccount!(inputDto)
      const accountLinkedMsg: AccountLinkedQueueMessage = {
        provider: inputDto.provider,
        userId: inputDto.userId,
        scope: inputDto.scope,
      }
      try {
        mqChannel.sendToQueue(
          rabbitMQAccountLinkedQueueName,
          Buffer.from(JSON.stringify(accountLinkedMsg))
        )
      } catch (mqSendErr) {
        console.warn('Error sending account_linked message to queue', mqSendErr, accountLinkedMsg)
      }
      res.status(201).json(result)
    } catch (error) {
      console.error('Error linking provider account: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.delete('/providers/:provider/accounts/:providerAccountId/unlink', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!req.params.provider || !req.params.providerAccountId) {
        return res.status(404)
      }
      const { provider, providerAccountId } = req.params

      const result = await mongoAuthAdapter.unlinkAccount!({ provider, providerAccountId })

      if (!result) {
        res
          .status(404)
          .json({ error: `Provider account "${provider}, ${providerAccountId}" not found` })
      } else {
        res.json(result)
      }
    } catch (error) {
      console.error('Error unlinking account: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/sessions/:sessionToken/with-user', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!z.uuidv4().safeParse(req.params.sessionToken).success) {
        console.warn('Get session and user param validation failed', {
          url: req.url,
          params: req.params,
        })
        return res.status(404)
      }

      const result = await mongoAuthAdapter.getSessionAndUser!(req.params.sessionToken)

      if (!result) {
        res.status(404).json({ error: `Session with token "${req.params.sessionToken}" not found` })
      } else {
        res.status(200).json(result)
      }
    } catch (error) {
      console.error('Error fetching session and user: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/sessions', async (req, res) => {
    const inputDto = req.body as SessionInputDto
    const valResult = await SessionInputDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      const validationErrors = mapDtoValidationErrors(valResult.error)
      console.warn('Create session input validation failed', {
        url: req.url,
        validationErrors,
        inputDto,
      })
      return res.status(400).json({
        errors: validationErrors,
      })
    }

    try {
      const result = await mongoAuthAdapter.createSession!(valResult.data)
      res.status(201).json(result)
    } catch (error) {
      console.error('Error creating session: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.put('/sessions/:sessionToken', async (req, res) => {
    const inputDto = req.body as SessionInputDto
    const valResult = await SessionInputDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      return res.status(400).json({
        errors: mapDtoValidationErrors(valResult.error),
      })
    }

    try {
      const result = await mongoAuthAdapter.updateSession!(inputDto)
      res.status(200).json(result)
    } catch (error) {
      console.error('Error updating session: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.put('/sessions/:sessionToken', async (req, res) => {
    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!z.uuidv4().safeParse(req.params.sessionToken).success) {
      return res.status(404)
    }

    const inputDto = req.body as SessionInputDto

    const valResult = await SessionInputDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      return res.status(400).json({
        errors: mapDtoValidationErrors(valResult.error),
      })
    }

    try {
      const result = await mongoAuthAdapter.updateSession!(inputDto)
      res.status(200).json(result)
    } catch (error) {
      console.error('Error updating session: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.delete('/sessions/:sessionToken', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!z.uuidv4().safeParse(req.params.sessionToken).success) {
        return res.status(404)
      }

      const result = await mongoAuthAdapter.deleteSession!(req.params.sessionToken)

      if (!result) {
        res.status(404).json({ error: `Session with token "${req.params.sessionToken}" not found` })
      } else {
        res.status(200).json(result)
      }
    } catch (error) {
      console.error('Error deleting session: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/verification-tokens', async (req, res) => {
    const inputDto = req.body as VerificationTokenInputDto

    const valResult = await VerificationTokenInputDtoSchema.safeParseAsync(inputDto)

    if (!valResult.success) {
      return res.status(400).json({
        errors: mapDtoValidationErrors(valResult.error),
      })
    }

    try {
      const result = await mongoAuthAdapter.createVerificationToken!(inputDto)
      res.status(201).json(result)
    } catch (error) {
      console.error('Error creating verification token: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.delete('/verification-tokens/:identifier/use/:token', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!req.params.identifier || !req.params.token) {
        return res.status(404)
      }

      const { identifier, token } = req.params

      const result = await mongoAuthAdapter.useVerificationToken!({ identifier, token })

      if (!result) {
        res.status(404).json({ error: `Verification token "${identifier}/${token}" not found` })
      } else {
        res.status(200).json(result)
      }
    } catch (error) {
      console.error('Error using verification token: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  if (disableInternalMtls) {
    app.listen(servicePort, () => {
      console.log(`OAuth service listening on unsecure port ${servicePort}`)
    })
  } else {
    const privateKeyPath =
      process.env.OAUTH_SVC_PRIVATE_KEY_PATH ?? '../../.certs/oauth-service/oauth-service.key.pem'
    const certFilePath =
      process.env.OAUTH_SVC_CERT_PATH ?? '../../.certs/oauth-service/oauth-service.cert.pem'
    const caCertPath = process.env.CA_CERT_PATH ?? '../../.certs/ca/ca.cert.pem'
    const httpsServerOptions: https.ServerOptions = {
      key: fs.readFileSync(privateKeyPath),
      cert: fs.readFileSync(certFilePath),
      ca: fs.readFileSync(caCertPath),
      requestCert: true, // request client cert
      rejectUnauthorized: true, // reject connections with invalid or missing client cert
    }
    https.createServer(httpsServerOptions, app).listen(servicePort, () => {
      console.log(`OAuth service listening on secure port ${servicePort}`)
    })
  }
}

main()
