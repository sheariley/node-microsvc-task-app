'use client'

import { useUserTasks } from '@/lib/hooks'
import { cn } from '@/lib/ui-helpers'
import { Alert, Button, Link, Skeleton } from '@/app/components/ui'
import { RocketIcon } from 'lucide-react'
import { coalesceErrorMsg } from 'ms-task-app-common'
import React from 'react'

export type TaskListProps = React.ComponentProps<'ul'> & {
  userId: string
}

const baseClassName = 'flex flex-col items-stretch gap-2 min-w-[300px] max-w-[550px]'

export function TaskList({ userId, className, ...props }: TaskListProps) {
  const { tasks, tasksLoadError, tasksLoading } = useUserTasks(userId)

  if (tasksLoadError) {
    const msg = coalesceErrorMsg(tasksLoadError)
    return (
      <div className={cn(baseClassName, className)}>
        <Alert color="danger" title={msg} />
      </div>
    )
  }

  if (tasksLoading) {
    return (
      <div className={cn(baseClassName, '*:h-8', className)}>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (!tasks?.length) {
    return (
      <div className={cn(baseClassName, 'items-center gap-4', className)}>
        <div>You don&apos;t have any tasks at the moment.</div>
        <Button color="primary" aria-label="Create New Task" as={Link} href="/tasks/new">
          <RocketIcon />
          Create a New One!
        </Button>
      </div>
    )
  }

  return (
    <ul className={cn(baseClassName, className)} {...props}>
      {tasks.map(task => (
        <li key={task._id}>{task.title}</li>
      ))}
    </ul>
  )
}
