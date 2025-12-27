import * as z from 'zod'

export const ObjectIdStringLength = 24
export const ObjectIdStringSchema = z.hex().length(ObjectIdStringLength)