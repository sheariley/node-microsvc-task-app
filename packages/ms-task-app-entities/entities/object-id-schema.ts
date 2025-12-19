import * as z from 'zod'
import mongoose from 'mongoose'

export const ObjectIdSchema = z
  .string()
  .refine(val => mongoose.Types.ObjectId.isValid(val), { message: '_id is an invalid ObjectId' })
