import * as z from 'zod'

import { ObjectIdStringSchema } from './common.js'

export const VerificationTokenInputDtoSchema = z.object({
  identifier: z.string(),
  expires: z.date(),
  token: z.string()
})

export const VerificationTokenDtoSchema = z.object({
  id: ObjectIdStringSchema,
  ...VerificationTokenInputDtoSchema.shape
})

export type VerificationTokenInputDto = z.infer<typeof VerificationTokenInputDtoSchema>
export type VerficiationTokenDto = z.infer<typeof VerificationTokenDtoSchema>
