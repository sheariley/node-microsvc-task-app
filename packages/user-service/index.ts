import express from 'express'
import mongoose from 'mongoose'
import bodyParser from 'body-parser'

const app = express()
const port = 3001

app.use(bodyParser.json())

mongoose.connect('mongodb://localhost:27017/users').then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error: ', err);
})

const UserSchema = new mongoose.Schema({
  name: String,
  email: String
})

const User = mongoose.model('User', UserSchema)

// used for container health-check
app.get('/ping', async (req, res) => {
  res.status(200).json({ timestamp: Date.now() })
})

app.get('/users', async (req, res) => {
  const users = await User.find()
  res.json(users)
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
    const reason = error instanceof Error ? error.message : (error as any).toString()
    res.status(500).json({ message: 'Internal Server Error', reason })
  }
})

app.post('/users', async (req, res) => {
  const {name, email} = req.body

  try {
    const user = new User({name, email})
    await user.save()
    res.status(201).json(user)
  } catch(error) {
    console.error('Error saving: ', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.listen(port, () => {
  console.log(`User service listening on port ${port}`)
})


// Command to run temp local instance of MongoDB
/*
Bash:
export MONGODB_VERSION=8.0-ubi8
docker run --name mongodb -d -p 27017:27017 mongodb/mongodb-community-server:$MONGODB_VERSION

Powershell:
$env:MONGODB_VERSION="8.0-ubi8"; docker run --name mongodb -d -p 27017:27017 mongodb/mongodb-community-server:$env:MONGODB_VERSION
*/
