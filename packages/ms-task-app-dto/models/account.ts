import * as z from 'zod'

import { ObjectIdStringSchema } from './common.js'

export const AuthorizationDetailsSchema = z.object({
  type: z.string(),
  locations: z.array(z.string()),
  actions: z.array(z.string()),
  datatypes: z.array(z.string()),
  privileges: z.array(z.string()),
  identifier: z.string(),
}).catchall(z.json())

export type AuthorizationDetailsDto = z.infer<typeof AuthorizationDetailsSchema>

export const ProviderTypeSchema = z.literal(['oauth', 'oidc', 'email', 'credentials', 'webauthn'])
export const AccountTypeSchema = z.literal(['oauth', 'oidc', 'email', 'webauthn'])

export const AccountInputDtoSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  id_token: z.string(),
  refresh_token: z.string(),
  scope: z.string(),
  authorization_details: z.array(AuthorizationDetailsSchema),
  token_type: z.literal(['bearer', 'dpop']),
  provider: z.string(),
  providerAccountId: z.string(),
  type: AccountTypeSchema,
  userId: ObjectIdStringSchema,
  expires_at: z.number()
}).catchall(z.json())

export const AccountDtoSchema = z.object({
  id: ObjectIdStringSchema,
  ...AccountInputDtoSchema.shape
})

export type AccountInputDto = z.infer<typeof AccountInputDtoSchema>
export type AccountDto = z.infer<typeof AccountDtoSchema>
