import { getSSRTaskServiceClient } from '@/lib/api-clients/ssr'
import { TaskList } from '@/app/components/task-list/task-list'
import { Button, Link } from '@/app/components/ui'
import { RocketIcon } from 'lucide-react'

type TaskListViewProps = {
  userId: string
}

export async function TaskListView({userId}: TaskListViewProps) {
  const taskApiClient = await getSSRTaskServiceClient()
  const tasks = await taskApiClient.getUserTasks(userId)

  if (!tasks?.length) {
    return (
      <div className="flex flex-col items-center gap-4 min-w-75 max-w-137.5">
        <div>You don&apos;t have any tasks at the moment.</div>
        <Button color="primary" aria-label="Create New Task" as={Link} href="/tasks/new">
          <RocketIcon />
          Create a New One!
        </Button>
      </div>
    )
  }

  return <TaskList tasks={tasks} />
}