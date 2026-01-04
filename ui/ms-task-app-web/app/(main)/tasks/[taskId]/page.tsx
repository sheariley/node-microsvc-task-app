import { Alert } from '@/app/components/ui'
import { auth } from '@/auth'
import { getSSRTaskServiceClient } from '@/lib/api-clients/ssr'
import { coalesceErrorMsg } from 'ms-task-app-common'
import { TaskDto, TaskInputDto } from 'ms-task-app-dto'
import { redirect } from 'next/navigation'
import TaskEditForm from './TaskEditForm.client'

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
      const client = await getSSRTaskServiceClient()
      task = await client.getUserTaskById(session.user.id!, taskId)
    } catch (err) {
      // network or unexpected error — show an alert instead of silently falling back
      console.error('Failed to fetch task', err)
      fetchError = coalesceErrorMsg(err)
    }
  }

  return (
    <div className="container">
      {fetchError ? (
        <div className="my-3">
          <Alert color="danger" title={fetchError} />
        </div>
      ) : (
        <>
          <h1 className="text-2xl mb-6">{isNew ? 'Create New Task' : 'Edit Task'}</h1>
          <TaskEditForm task={task!} userId={session.user.id!} />
        </>
      )}
    </div>
  )
}
