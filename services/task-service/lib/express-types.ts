import type { Session, User } from '@auth/core/types'

export type Locals = {
  session?: Session,
  user?: User
}

export type BulkOpLocals = {
  taskIds: string[]
}