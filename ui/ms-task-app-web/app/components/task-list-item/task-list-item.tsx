import { Button, Link, Spinner } from '@/app/components/ui'
import { cn } from '@/lib/ui-helpers'
import { CheckIcon } from 'lucide-react'
import { TaskDto } from 'ms-task-app-dto'
import React from 'react'

export type TaskListItemProps = React.ComponentProps<'div'> & {
  task: TaskDto
  disabled?: boolean
  togglingCompleted?: boolean
  onToggleCompleted: () => unknown
}

export function TaskListItem({ task, togglingCompleted, onToggleCompleted, disabled = false, className, ...props }: TaskListItemProps) {
  const toggleCompleteButtonHelpText = task.completed
    ? 'Completed (press to mark as incomplete)'
    : 'Not completed (press to mark as completed)'

  return (
    <div {...props} className={cn('flex items-center gap-3 overflow-hidden select-none', className)}>
      <Link
        href={`/tasks/${task._id}`}
        title={`${task.title}\n${task.description}` || undefined}
        isDisabled={disabled || togglingCompleted}
        className={cn('text-foreground leading-none flex-1 cursor-pointer truncate', {
          'text-neutral-500': disabled,
          'line-through': task.completed,
        })}
      >
        {task.title}
      </Link>

      <Button
        type="button"
        isIconOnly
        aria-label={toggleCompleteButtonHelpText}
        title={toggleCompleteButtonHelpText}
        size="sm"
        variant="solid"
        color={!togglingCompleted && task.completed ? 'success' : 'secondary'}
        className="flex size-6 min-w-6 shrink-0 items-center justify-center"
        isDisabled={disabled || togglingCompleted}
        onPress={() => onToggleCompleted()}
      >
        {togglingCompleted ? <Spinner size="sm" /> : task.completed && <CheckIcon size="16" />}
      </Button>
    </div>
  )
}
