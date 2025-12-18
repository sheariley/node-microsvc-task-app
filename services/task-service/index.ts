import express from 'express'
import mongoose from 'mongoose'
import bodyParser from 'body-parser'

const app = express()
const port = 3002
const mongoPort = Number(process.env.MONGODB_PORT)
const mongoHost = process.env.MONGODB_HOST
const mongoConString = `mongodb://${mongoHost}:${mongoPort}/tasks`;

app.use(bodyParser.json())

async function main() {
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
        res.status(404).json({ error: true, message: 'Task not found' })
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
      res.status(201).json(task)
    } catch(error) {
      const reason = error instanceof Error ? error.message : (error as any).toString()
      console.error('Error saving: ', error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.put('/users/:userId/tasks/:taskId', async (req, res) => {
    const {taskId} = req.params
    const {title, description, completed} = req.body

    try {
      const task = await Task.findByIdAndUpdate(taskId, { title, description, completed })
        .where('userId')
        .equals(req.params.userId)
      
      if (!task) {
        res.status(404).json({ error: true, message: 'Task not found' })
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
