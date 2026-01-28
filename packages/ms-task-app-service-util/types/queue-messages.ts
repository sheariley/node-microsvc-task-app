export type TaskCreatedQueueMessage = {
  taskId: string
  userId: string
  title: string
}

export type TaskUpdatedQueueMessage = TaskCreatedQueueMessage & {
  description?: string | null | undefined
  completed?: boolean | null | undefined
}

export type AccountLinkedQueueMessage = {
  userId: string
  provider?: string
  scope: string
}
