import * as z from 'zod'

export const NameMinLen = 3
export const NameMaxLen = 60

export const UserInputDtoSchema = z.object({
  name: z.string('Name is required')
    .min(NameMinLen, `Must be at least ${NameMinLen} characters`)
    .max(NameMaxLen, `Must be no more than ${NameMaxLen} characters`),
  email: z.email('Must be a valid email address')
})

export const UserDtoSchema = z.object({
  _id: z.string(),
  ...UserInputDtoSchema.shape
})

export type UserInputDto = z.infer<typeof UserInputDtoSchema>
export type UserDto = z.infer<typeof UserDtoSchema>
