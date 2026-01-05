'use client'

import { cn } from '@/lib/ui-helpers'
import { TaskDto } from 'ms-task-app-dto'
import React from 'react'
import { TaskListItem } from '../task-list-item/task-list-item'

export type TaskListProps = React.ComponentProps<'ul'> & {
  tasks: TaskDto[]
}

export function TaskList({ tasks, className, ...props }: TaskListProps) {
  return (
    <ul
      className={cn('flex max-w-137.5 min-w-75 flex-col items-stretch gap-2', className)}
      {...props}
    >
      {tasks.map(task => (
        <TaskListItem key={task._id} task={task} />
      ))}
    </ul>
  )
}
