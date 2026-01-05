'use client'

import { Button, Checkbox, Form, Input, Textarea, addToast } from '@/app/components/ui'
import { useTaskServiceClient } from '@/lib/api-clients/task-service-client'
import { cn } from '@/lib/ui-helpers'
import { zodResolver } from '@hookform/resolvers/zod'
import { OctagonAlertIcon, SaveIcon, ThumbsUpIcon, XIcon } from 'lucide-react'
import { coalesceErrorMsg } from 'ms-task-app-common'
import { TaskDto, TaskInputDto, TaskInputDtoSchema, isTaskDto } from 'ms-task-app-dto'
import { useRouter } from 'next/navigation'
import React from 'react'
import { Controller, useForm } from 'react-hook-form'

type Props = React.ComponentProps<typeof Form> & {
  task: TaskDto | TaskInputDto
  userId: string
}

export default function TaskEditForm({ task, userId, className, ...formProps }: Props) {
  const router = useRouter()
  const taskClient = useTaskServiceClient()

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TaskInputDto>({
    mode: 'all',
    resolver: zodResolver(TaskInputDtoSchema),
    defaultValues: {
      title: task.title ?? '',
      description: task.description ?? undefined,
      completed: !!task.completed,
    },
  })

  async function onSubmit(data: TaskInputDto) {
    try {
      const id = isTaskDto(task) ? task._id : undefined

      if (id) {
        await taskClient.updateTask(userId, id, data)
        addToast({
          title: 'Task updated successfully.',
          icon: <ThumbsUpIcon />,
          color: 'success',
        })
      } else {
        const newTask = await taskClient.createTask(userId, data)
        addToast({
          title: 'Task created successfully.',
          icon: <ThumbsUpIcon />,
          color: 'success',
        })
        router.replace(`/tasks/${newTask._id}`)
      }
    } catch (err) {
      console.error('Failed to save task', err)
      addToast({
        title: 'Failed to save task!',
        description: coalesceErrorMsg(err),
        icon: <OctagonAlertIcon />,
        color: 'danger',
      })
    }
  }

  return (
    <Form
      {...formProps}
      onSubmit={handleSubmit(onSubmit)}
      className={cn('flex w-full max-w-2xl flex-col items-stretch', className)}
    >
      <div className="mb-4">
        <Controller
          name="title"
          control={control}
          render={({
            field: { name, value, onChange, onBlur, ref },
            fieldState: { invalid, error },
          }) => (
            <>
              <Input
                ref={ref}
                isRequired
                name={name}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                label="Title"
                placeholder="Enter title"
                validationBehavior="aria"
                isInvalid={invalid}
                errorMessage={() => error?.message}
                disabled={isSubmitting}
              />
            </>
          )}
        />
      </div>

      <div className="mb-4">
        <Controller
          name="description"
          control={control}
          render={({
            field: { name, value, onChange, onBlur, ref },
            fieldState: { invalid, error },
          }) => (
            <>
              <Textarea
                ref={ref}
                name={name}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                label="Description"
                rows={6}
                placeholder="Optional description"
                validationBehavior="aria"
                isInvalid={invalid}
                errorMessage={() => error?.message}
                disabled={isSubmitting}
              />
            </>
          )}
        />
      </div>

      <div className="mb-4">
        <Controller
          name="completed"
          control={control}
          render={({ field }) => (
            <Checkbox checked={!!field.value} onChange={field.onChange} disabled={isSubmitting}>
              Completed
            </Checkbox>
          )}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" color="primary" disabled={isSubmitting}>
          <SaveIcon size="20" /> Save
        </Button>
        <Button type="button" variant="flat" onPress={() => router.push('/')}>
          <XIcon size="20" /> Cancel
        </Button>
      </div>
    </Form>
  )
}
