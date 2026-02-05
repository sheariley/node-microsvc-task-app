import { TaskDtoSchema } from 'ms-task-app-dto'
import * as z from 'zod'

import { ObjectIdSchema } from './object-id-schema.js'
import mongoose from 'mongoose'

export const TaskEntitySchema = z.object({
  ...TaskDtoSchema.shape,
  _id: ObjectIdSchema,
})

export type TaskEntity = z.infer<typeof TaskEntitySchema>

export const TaskDbSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completed: Boolean,
  })

export function _getTaskModel() {
  return mongoose.model('Task', TaskDbSchema)
}

export type TaskModel = ReturnType<typeof _getTaskModel>

let taskModel: TaskModel

export function getTaskModel() {
  if (!taskModel) {
    taskModel = _getTaskModel()
  }
  return taskModel
}
