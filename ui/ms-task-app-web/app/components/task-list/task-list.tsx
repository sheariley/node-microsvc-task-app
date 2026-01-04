'use client'

import { cn } from '@/lib/ui-helpers'
import { TaskDto } from 'ms-task-app-dto'
import React from 'react'

export type TaskListProps = React.ComponentProps<'ul'> & {
  tasks: TaskDto[]
}

export function TaskList({ tasks, className, ...props }: TaskListProps) {
  return (
    <ul className={cn('flex flex-col items-stretch gap-2 min-w-75 max-w-137.5', className)} {...props}>
      {tasks.map(task => (
        <li key={task._id}>{task.title}</li>
      ))}
    </ul>
  )
}
