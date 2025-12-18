import bodyParser from 'body-parser'
import express from 'express'
import { coalesceErrorMsg, connectMongoDbWithRetry } from 'ms-task-app-shared'

const port = 3001
const mongoPort = Number(process.env.MONGODB_PORT || 27017)
const mongoHost = process.env.MONGODB_HOST || 'localhost'

async function main() {
  const app = express()
  app.use(bodyParser.json())

  const { connection: userDbCon, error: userDbConError } = (await connectMongoDbWithRetry({
    host: mongoHost,
    port: mongoPort,
    dbName: 'users',
  }))!

  if (userDbConError || !userDbCon) {
    process.exit(1)
  }

  const UserSchema = new userDbCon.Schema({
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
  })

  const User = userDbCon.model('User', UserSchema)

  // used for container health-check
  app.get('/ping', async (req, res) => {
    res.status(200).json({ timestamp: Date.now() })
  })

  app.get('/users', async (req, res) => {
    try {
      const users = await User.find()
      res.json(users)
    } catch (error) {
      console.error('Error fetching users: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/users/:userId', async (req, res) => {
    try {
      const results = await User.find().where('_id').equals(req.params.userId)
      if (!results?.length) {
        res.status(404).json({ error: `User with Id "${req.params.userId}" not found` })
      } else {
        res.json(results[0])
      }
    } catch (error) {
      console.error('Error fetching user: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.post('/users', async (req, res) => {
    const { name, email } = req.body

    try {
      const user = new User({ name, email })
      await user.save()
      res.status(201).json(user)
    } catch (error) {
      console.error('Error saving: ', error)
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.listen(port, () => {
    console.log(`User service listening on port ${port}`)
  })
}

main()
