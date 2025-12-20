import bodyParser from 'body-parser'
import express from 'express'
import mongoose from 'mongoose'
import { mapDtoValidationErrors, TaskInputDtoSchema, type TaskInputDto } from 'ms-task-app-dto'
import { TaskModel } from 'ms-task-app-entities'
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

  // used for container health-check
  app.get('/ping', async (req, res) => {
    res.status(200).json({ timestamp: Date.now() })
  })

  app.get('/users/:userId/tasks', async (req, res) => {
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(req.params.userId)) {
        return res.status(404)
      }

      const tasks = await TaskModel.find().where('userId').equals(req.params.userId)
      res.json(tasks)
    } catch (error) {
      const reason = coalesceErrorMsg(error)
      res.status(500).json({ error: true, message: 'Internal Server Error', reason })
    }
  })

  app.get('/users/:userId/tasks/:taskId', async (req, res) => {
    const { userId, taskId } = req.params
    try {
      // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
      if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
        return res.status(404)
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

  app.post('/users/:userId/tasks', async (req, res) => {
    const { userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(404)
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
          userId,
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

  app.put('/users/:userId/tasks/:taskId', async (req, res) => {
    const { taskId, userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
      return res.status(404)
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
          userId,
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

  app.delete('/users/:userId/tasks/:taskId', async (req, res) => {
    const { taskId, userId } = req.params

    // return 404 if invalid route params (needs to be vague so potential attackers can't infer details of system)
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(taskId)) {
      return res.status(404)
    }

    const task = await TaskModel.findByIdAndDelete(
      taskId
    )
      .where('userId')
      .equals(userId)

    if (!task) {
      return res.status(404).json({ error: true, message: 'Task not found' })
    }

    res.status(204).send()
  })

  app.listen(port, () => {
    console.log(`Task service listening on port ${port}`)
  })
}

main()
