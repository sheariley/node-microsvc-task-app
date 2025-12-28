import * as z from 'zod'

import { ObjectIdStringSchema } from './common.js'

export const SessionInputDtoSchema = z.object({
  sessionToken: z.uuidv4(),
  userId: ObjectIdStringSchema,
  expires: z.coerce.date()
})

export const SessionDtoSchema = z.object({
  id: ObjectIdStringSchema,
  ...SessionInputDtoSchema.shape
})

export type SessionInputDto = z.infer<typeof SessionInputDtoSchema>
export type SessionDto = z.infer<typeof SessionDtoSchema>
