import mongoose from 'mongoose'
import { UserDtoSchema } from 'ms-task-app-dto'
import * as z from 'zod'

import { ObjectIdSchema } from './object-id-schema.js'

export const UserEntitySchema = z.object({
  ...UserDtoSchema.shape,
  _id: ObjectIdSchema,
})

export type UserEntity = z.infer<typeof UserEntitySchema>

export const UserDbSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  emailVerified: {
    type: Date,
    required: false,
  },
})

export function getUserModel() {
  return mongoose.model('User', UserDbSchema)
}
