import * as z from 'zod'
import { ObjectIdStringSchema } from './common.js'

export const UserDtoSchema = z.object({
  id: ObjectIdStringSchema,
  email: z.email('Must be a valid email address'),
  emailVerified: z.date().nullable()
})

export type UserDto = z.infer<typeof UserDtoSchema>
