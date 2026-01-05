import { toggleTaskComplete } from '@/server-actions/toggle-task-complete'
import { TaskDto } from 'ms-task-app-dto'
import React from 'react'
import { addToast, Button, Link, Spinner } from '@/app/components/ui'
import { cn } from '@/lib/ui-helpers'
import { CheckIcon, OctagonAlertIcon, ThumbsUpIcon } from 'lucide-react'
import { coalesceErrorMsg } from 'ms-task-app-common'

export type TaskListItemProps = {
  task: TaskDto
}

export function TaskListItem({task}: TaskListItemProps) {
  const [togglingCompleted, startToggleCompleted] = React.useTransition()
  
  const handleToggleCompleted = React.useCallback(() => {
    startToggleCompleted(async () => {
      try {
        await toggleTaskComplete(task)
        addToast({
          color: 'success',
          icon: <ThumbsUpIcon />,
          title: !task.completed ? 'Task marked as completed' : 'Task marked as incomplete'
        })
      } catch (error) {
        const description = coalesceErrorMsg(error)
        addToast({
          color: 'danger',
          icon: <OctagonAlertIcon />,
          title: !task.completed ? 'Failed to mark task as completed' : 'Failed to mark task as incomplete',
          description
        })
      }
    })
  }, [task, startToggleCompleted])

  return (
    <li className="flex items-center gap-3 rounded-md p-2 select-none">
      <Button
        type="button"
        aria-label={task.completed ? 'Completed' : 'Not completed'}
        size="sm"
        variant="ghost"
        color={task.completed && !togglingCompleted ? 'success' : 'default'}
        className={cn(
          'flex h-8 w-8 min-w-8 shrink-0 items-center justify-center',
          task.completed ? 'text-success' : 'text-primary'
        )}
        isIconOnly
        disabled={togglingCompleted}
        onPress={handleToggleCompleted}
      >
        {togglingCompleted ? (
          <Spinner size="sm" />
        ) : (
          task.completed && <CheckIcon size="20" />
        )}
      </Button>

      <Link
        href={`/tasks/${task._id}`}
        title={task.description || undefined}
        isDisabled={togglingCompleted}
        className="text-foreground cursor-pointer truncate hover:underline"
      >
        {task.title}
      </Link>
    </li>
  )
}