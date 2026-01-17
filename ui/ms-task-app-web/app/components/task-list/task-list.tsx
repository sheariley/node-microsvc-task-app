'use client'

import {
  addToast,
  Button,
  ButtonGroup,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  useDisclosure,
} from '@/app/components/ui'
import { cn } from '@/lib/ui-helpers'
import { toggleArrayValue } from '@/lib/util'
import {
  completeTasks,
  deleteTasks,
  toggleTaskComplete,
  uncompleteTasks,
} from '@/server-actions/task-crud'
import {
  CheckCheckIcon,
  CheckIcon,
  OctagonAlertIcon,
  ThumbsUpIcon,
  Trash2Icon,
  UndoIcon,
  XIcon,
} from 'lucide-react'
import { coalesceErrorMsg } from 'ms-task-app-common'
import { ApiErrorResponse, isApiErrorResponse, TaskDto } from 'ms-task-app-dto'
import { useRouter } from 'next/navigation'
import React from 'react'
import TaskEditForm from '../task-edit-form/task-edit-form.client'
import { TaskListItem } from '../task-list-item/task-list-item'

export type TaskListProps = React.ComponentProps<'div'> & {
  userId: string
  tasks: TaskDto[]
}

type BulkOpOptions<T = void> = {
  successMsg: string
  successIcon?: React.ReactNode
  failMsg: string
  op: (taskIds: string[]) => T
}

export function TaskList({ userId, tasks, className, ...props }: TaskListProps) {
  const router = useRouter()
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([])
  const [togglingCompleted, startToggleCompleted] = React.useTransition()
  const [togglingTaskId, setTogglingTaskId] = React.useState<string>()
  const [bulkOpPending, startBulkOp] = React.useTransition()
  const {
    isOpen: isConfirmDeleteOpen,
    onOpen: openConfirmDelete,
    onOpenChange: onConfirmDeleteOpenChange,
    onClose: onConfirmDeleteClose,
  } = useDisclosure()

  const allSelected = selectedTaskIds.length === tasks.length
  const bulkOpsDisabled = bulkOpPending || !!togglingTaskId?.length || !selectedTaskIds.length

  const handleToggleCompleted = React.useCallback((task: TaskDto) => {
    setTogglingTaskId(task._id)

    startToggleCompleted(async () => {
      try {
        const result = await toggleTaskComplete(task)
        if (result.error) throw new Error(result.message, { cause: result })

        addToast({
          color: 'success',
          icon: <ThumbsUpIcon />,
          title: !task.completed ? 'Task marked as completed' : 'Task marked as incomplete',
        })
      } catch (error) {
        const description = coalesceErrorMsg(error)
        addToast({
          color: 'danger',
          icon: <OctagonAlertIcon />,
          title: !task.completed
            ? 'Failed to mark task as completed'
            : 'Failed to mark task as incomplete',
          description,
        })
      } finally {
        setTogglingTaskId(undefined)
      }
    })
  }, [])

  const handleToggleAllSelected = React.useCallback(() => {
    if (allSelected) {
      setSelectedTaskIds([])
    } else {
      setSelectedTaskIds(tasks.map(x => x._id))
    }
  }, [tasks, allSelected])

  const handleToggleTaskSelected = React.useCallback((taskId: string, selected?: boolean) => {
    setSelectedTaskIds(selectedIds => toggleArrayValue(selectedIds, taskId, selected))
  }, [])

  const startBulkOpIfSelection = React.useCallback(
    <T,>({ successMsg, failMsg, op, successIcon = <ThumbsUpIcon /> }: BulkOpOptions<T>) => {
      if (!selectedTaskIds?.length) {
        addToast({
          color: 'danger',
          icon: <OctagonAlertIcon />,
          title: 'You must select at least one task!',
        })
        return
      }

      startBulkOp(async () => {
        try {
          const result = await op(selectedTaskIds)
          if (result && isApiErrorResponse(result)) {
            throw new Error(result.message, { cause: result })
          }

          setSelectedTaskIds([]) // clear selection after bulk op
          addToast({
            color: 'success',
            icon: successIcon,
            title: successMsg,
          })
        } catch (error) {
          const description = coalesceErrorMsg(error)
          addToast({
            color: 'danger',
            icon: <OctagonAlertIcon />,
            title: failMsg,
            description,
          })
        }
      })
    },
    [selectedTaskIds]
  )

  const handleConfirmDeleteSelected = React.useCallback(() => {
    if (selectedTaskIds?.length) {
      openConfirmDelete()
    }
  }, [selectedTaskIds, openConfirmDelete])

  const handleDeleteSelectedTasks = React.useCallback(() => {
    startBulkOpIfSelection({
      successMsg: 'Task(s) deleted',
      successIcon: <Trash2Icon />,
      failMsg: 'Failed to delete task(s)',
      op: async taskIds => {
        try {
          return await deleteTasks(userId, taskIds)
        } catch (error) {
          return {
            error: true,
            message: coalesceErrorMsg(error)
          } as ApiErrorResponse
        } finally {
          onConfirmDeleteClose()
        }
      },
    })
  }, [userId, startBulkOpIfSelection, onConfirmDeleteClose])

  const handleMarkSelectedComplete = React.useCallback(() => {
    startBulkOpIfSelection({
      successMsg: 'Task(s) marked as completed',
      successIcon: <CheckCheckIcon />,
      failMsg: 'Failed to mark task(s) as completed',
      op: async taskIds => await completeTasks(userId, taskIds),
    })
  }, [userId, startBulkOpIfSelection])

  const handleMarkSelectedIncomplete = React.useCallback(() => {
    startBulkOpIfSelection({
      successMsg: 'Task(s) marked as incompleted',
      successIcon: <XIcon />,
      failMsg: 'Failed to mark task(s) as incompleted',
      op: async taskIds => await uncompleteTasks(userId, taskIds),
    })
  }, [userId, startBulkOpIfSelection])

  return (
    <>
      <div
        className={cn('flex max-w-full flex-col items-stretch gap-12 overflow-hidden', className)}
        {...props}
      >
        <ButtonGroup>
          <Button
            type="button"
            color="default"
            variant="solid"
            size="sm"
            className="min-w-30.5"
            isDisabled={bulkOpPending || togglingCompleted}
            onPress={handleToggleAllSelected}
          >
            {allSelected ? (
              <>
                <XIcon size="16" /> Select None
              </>
            ) : (
              <>
                <CheckCheckIcon size="16" /> Select All
              </>
            )}
          </Button>
          <Button
            type="button"
            color="success"
            variant="solid"
            size="sm"
            isDisabled={bulkOpsDisabled}
            onPress={handleMarkSelectedComplete}
          >
            <CheckIcon size="16" /> Mark Complete
          </Button>
          <Button
            type="button"
            color="secondary"
            variant="solid"
            size="sm"
            isDisabled={bulkOpsDisabled}
            onPress={handleMarkSelectedIncomplete}
          >
            <UndoIcon size="16" /> Mark Incomplete
          </Button>
          <Button
            type="button"
            color="danger"
            variant="solid"
            size="sm"
            isDisabled={bulkOpsDisabled}
            onPress={handleConfirmDeleteSelected}
          >
            <Trash2Icon size="16" /> Delete Selected
          </Button>
        </ButtonGroup>
        <ul className="mx-8 flex min-w-75 flex-1 flex-col items-stretch gap-2 overflow-hidden sm:mx-0">
          {tasks.map(task => (
            <li
              key={task._id}
              className="bg-content2 hover:bg-content3 flex items-center gap-5 overflow-hidden rounded-xl p-4 select-none hover:underline"
            >
              <Checkbox
                size="lg"
                classNames={{
                  wrapper: 'before:border-content1 before:bg-content3',
                }}
                isDisabled={bulkOpPending}
                isSelected={selectedTaskIds.includes(task._id)}
                onChange={event => handleToggleTaskSelected(task._id, event.target.checked)}
                aria-label="Toggle task selected"
                title="Toggle task selected"
              />
              <TaskListItem
                task={task}
                togglingCompleted={togglingCompleted && togglingTaskId === task._id}
                onToggleCompleted={() => handleToggleCompleted(task)}
                disabled={bulkOpPending || togglingCompleted}
                className="flex-1 shrink"
              />
            </li>
          ))}
          <li key="new-task" className="mt-4 flex items-stretch justify-stretch">
            <TaskEditForm inline userId={userId} onSubmitted={() => router.refresh()} />
          </li>
        </ul>
      </div>

      <Modal isOpen={bulkOpPending} hideCloseButton>
        <ModalContent className="bg-content1/40 w-auto p-6 backdrop-blur-xs">
          <ModalBody className="w-auto flex-none">
            <Spinner size="lg" />
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={isConfirmDeleteOpen} onOpenChange={onConfirmDeleteOpenChange}>
        <ModalContent>
          <ModalHeader>Confirm Deletion</ModalHeader>
          <ModalBody>
            <p>Are you sure you want to delete the {selectedTaskIds.length} selected tasks?</p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" color="default" variant="light" onPress={onConfirmDeleteClose}>
              Cancel
            </Button>
            <Button
              type="button"
              color="danger"
              variant="solid"
              onPress={handleDeleteSelectedTasks}
            >
              Delete {selectedTaskIds.length} Tasks
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
