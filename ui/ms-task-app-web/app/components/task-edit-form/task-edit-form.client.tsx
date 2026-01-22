'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { OctagonAlertIcon, SaveIcon, ThumbsUpIcon, XIcon } from 'lucide-react'
import { coalesceErrorMsg } from 'ms-task-app-common'
import { TaskDto, TaskInputDto, TaskInputDtoSchema, isTaskDto } from 'ms-task-app-dto'
import { useRouter } from 'next/navigation'
import React from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button, Checkbox, Form, Input, Textarea, addToast } from '@/app/components/ui'
import { useTaskServiceClient } from '@/lib/api-clients/task-service-client'
import clientLogger from '@/lib/logging/client-logger'
import { cn } from '@/lib/ui-helpers'

type Props = Omit<React.ComponentProps<typeof Form>, 'onSubmit' | 'onSubmitted'> & {
  task?: TaskDto | TaskInputDto
  userId: string
  inline?: boolean
  onSubmitted?: (task: TaskDto | TaskInputDto) => void | Promise<void>
}

export default function TaskEditForm({
  task,
  userId,
  inline,
  onSubmitted,
  className,
  ...formProps
}: Props) {
  const router = useRouter()
  const taskClient = useTaskServiceClient()

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    reset: resetForm,
  } = useForm<TaskInputDto>({
    mode: 'all',
    resolver: zodResolver(TaskInputDtoSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? undefined,
      completed: !!task?.completed,
    },
  })

  async function onSubmit(data: TaskInputDto) {
    try {
      const id = !!task && isTaskDto(task) ? task._id : undefined

      if (id) {
        await taskClient.updateTask(userId, id, data)
        addToast({
          title: 'Task updated successfully.',
          icon: <ThumbsUpIcon />,
          color: 'success',
        })
        if (onSubmitted) onSubmitted({ ...task, ...data })
      } else {
        const newTask = await taskClient.createTask(userId, data)
        addToast({
          title: 'Task created successfully.',
          icon: <ThumbsUpIcon />,
          color: 'success',
        })
        if (onSubmitted) onSubmitted({ ...task, ...data })
        if (!inline) {
          router.replace(`/tasks/${newTask._id}`)
        } else {
          resetForm()
        }
      }
    } catch (err) {
      clientLogger.error(err, 'Failed to save task')
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
      className={cn(
        'flex w-full items-stretch',
        {
          'max-w-2xl': !inline,
          'flex-row': inline,
        },
        className
      )}
    >
      <Controller
        name="title"
        control={control}
        render={({
          field: { name, value, onChange, onBlur, ref },
          fieldState: { invalid, error },
        }) => (
          <>
            <Input
              className={cn({ 'inline-block': inline, 'mb-4': !inline })}
              ref={ref}
              isRequired
              name={name}
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              label={!inline ? 'Title' : undefined}
              placeholder={inline ? 'New task title' : 'Enter title'}
              size={inline ? 'lg' : undefined}
              validationBehavior="aria"
              isInvalid={invalid}
              errorMessage={() => error?.message}
              disabled={isSubmitting}
              endContent={
                !inline ? undefined : (
                  <>
                    <Button
                      type="button"
                      className="hover:text-foreground hover:bg-content2 mr-2 text-neutral-400"
                      color="default"
                      variant="flat"
                      size="sm"
                      isIconOnly
                      title="Clear"
                      onPress={() => resetForm()}
                    >
                      <XIcon />
                    </Button>

                    <Button
                      type="submit"
                      color="primary"
                      disabled={isSubmitting}
                      size="sm"
                      className="gap-0 px-0 sm:gap-2 sm:px-3 sm:[&>svg]:max-w-8"
                    >
                      <SaveIcon size="20" />
                      <span className="hidden sm:inline"> Save</span>
                    </Button>
                  </>
                )
              }
            />
          </>
        )}
      />

      {!inline && (
        <>
          <Controller
            name="description"
            control={control}
            render={({
              field: { name, value, onChange, onBlur, ref },
              fieldState: { invalid, error },
            }) => (
              <>
                <Textarea
                  className="mb-4"
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

          <Controller
            name="completed"
            control={control}
            render={({ field }) => (
              <Checkbox
                className="mb-4"
                checked={!!field.value}
                onChange={field.onChange}
                disabled={isSubmitting}
              >
                Completed
              </Checkbox>
            )}
          />

          <div className="flex justify-end gap-2">
            <Button type="submit" color="primary" disabled={isSubmitting}>
              <SaveIcon size="20" /> Save
            </Button>
            <Button type="button" variant="flat" onPress={() => router.push('/')}>
              <XIcon size="20" /> Cancel
            </Button>
          </div>
        </>
      )}
    </Form>
  )
}
