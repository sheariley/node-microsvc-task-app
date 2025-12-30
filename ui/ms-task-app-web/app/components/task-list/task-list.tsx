'use client'

import { useTaskServiceClient } from '@/lib/api-clients'
import { Alert } from '@heroui/react'
import { coalesceErrorMsg } from 'ms-task-app-common'
import { TaskDto } from 'ms-task-app-dto'
import React from 'react'

export type TaskListProps = React.ComponentProps<'ul'> & {
  userId: string
}

export function TaskList({
  userId,
  ...props
}: TaskListProps) {
  const [taskFetchError, setTaskFetchError] = React.useState('')
  const [tasks, setTasks] = React.useState<TaskDto[]>([])
  const taskClient = useTaskServiceClient()

  React.useEffect(() => {
    async function fetchTasks() {
      try {
        const results = await taskClient.getUserTasks(userId)
        setTasks(results)
      } catch (error) {
        const msg = coalesceErrorMsg(error)
        setTaskFetchError(msg)
      }
    }

    fetchTasks()
  }, [taskClient, userId])

  if (taskFetchError?.length) {
    return <div className="w-full flex items-center my-3">
      <Alert color="danger" title={taskFetchError} />
    </div>
  }

  return (
    <ul {...props}>
      {tasks.map(task => (
        <li key={task._id}>{task.title}</li>
      ))}
    </ul>
  )
}