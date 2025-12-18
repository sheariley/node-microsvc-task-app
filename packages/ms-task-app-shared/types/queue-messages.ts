export type TaskCreatedQueueMessage = {
  taskId: string
  userId: string
  title: string
}

export type TaskUpdatedQueueMessage = TaskCreatedQueueMessage & {
  completed: boolean
}
