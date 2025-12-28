import * as z from 'zod'

export const UserDtoSchema = z.object({
  id: z.uuidv4(),
  email: z.email('Must be a valid email address'),
  emailVerified: z.date().nullable()
})

export type UserDto = z.infer<typeof UserDtoSchema>
