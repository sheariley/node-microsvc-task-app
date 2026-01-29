import { AlertOctagonIcon } from 'lucide-react'
import { coalesceError, coalesceErrorMsg } from 'ms-task-app-common'
import { TaskDto, TaskInputDto } from 'ms-task-app-dto'
import { redirect } from 'next/navigation'

import { ReloadButton } from '@/app/components/reload-button/reload-button.client'
import TaskEditForm from '@/app/components/task-edit-form/task-edit-form.client'
import { Alert } from '@/app/components/ui'
import { auth } from '@/auth'
import { getSSRTaskServiceClient } from '@/lib/api-clients/ssr'
import serverLogger from '@/lib/logging/server-logger'

type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params
  const session = await auth()

  if (!session?.user) {
    return redirect('/')
  }

  const isNew = taskId === 'new'

  let task: TaskDto | TaskInputDto | undefined
  let fetchError: string | undefined

  if (isNew) {
    task = { title: '', description: '', completed: false }
  } else {
    try {
      const taskApiClient = await getSSRTaskServiceClient()
      task = await taskApiClient.getUserTaskById(session.user.id!, taskId)
    } catch (err) {
      serverLogger.error('Failed to fetch task', coalesceError(err))
      fetchError = coalesceErrorMsg(err)
    }
  }

  return (
    <div className="container flex flex-col items-center">
      {fetchError ? (
        <div className="my-3">
          <Alert
            color="danger"
            variant="faded"
            className="mx-3 my-auto w-auto grow-0 sm:mx-auto sm:min-w-125"
            classNames={{
              alertIcon: 'fill-transparent',
            }}
            icon={<AlertOctagonIcon />}
            hideIconWrapper
            title="Oops! We failed to load this task!"
            description={fetchError}
            endContent={ <ReloadButton color="danger" /> }
          />
        </div>
      ) : (
        <>
          <h1 className="mb-6 text-2xl">{isNew ? 'Create New Task' : 'Edit Task'}</h1>
          <TaskEditForm task={task!} userId={session.user.id!} />
        </>
      )}
    </div>
  )
}
