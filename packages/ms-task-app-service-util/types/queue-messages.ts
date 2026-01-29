export type TaskBaseQueueMessage = {
  userId: string
  taskId: string
  title: string
}

export type TaskUpdatedQueueMessage = TaskBaseQueueMessage & {
  description?: string | null | undefined
  completed?: boolean | null | undefined
}

export type TaskBulkBaseQueueMessage = {
  userId: string
  taskIds: string[]
}

export type TaskBulkUpdateCompletedQueueName = TaskBulkBaseQueueMessage & {
  completed: boolean
}

export type AccountLinkedQueueMessage = {
  userId: string
  provider?: string
  scope: string
}
