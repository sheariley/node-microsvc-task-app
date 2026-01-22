import { AlertOctagonIcon, RocketIcon } from 'lucide-react'

import { ReloadButton } from '@/app/components/reload-button/reload-button.client'
import { TaskList } from '@/app/components/task-list/task-list.client'
import { Alert, Button, Link } from '@/app/components/ui'
import { getSSRTaskServiceClient } from '@/lib/api-clients/ssr'
import serverLogger from '@/lib/logging/server-logger'

type TaskListViewProps = {
  userId: string
}

export async function TaskListView({ userId }: TaskListViewProps) {
  try {
    const taskApiClient = await getSSRTaskServiceClient()
    const tasks = await taskApiClient.getUserTasks(userId)

    if (!tasks?.length) {
      return (
        <div className="flex max-w-137.5 min-w-75 flex-col items-center gap-4">
          <div>You don&apos;t have any tasks at the moment.</div>
          <Button color="primary" aria-label="Create New Task" as={Link} href="/tasks/new">
            <RocketIcon />
            Create a New One!
          </Button>
        </div>
      )
    }

    return <TaskList userId={userId} tasks={tasks} />
  } catch (error) {
    serverLogger.error(error, 'Failed to fetch tasks')
    return (
      <Alert
        color="danger"
        variant="faded"
        className="mx-3 my-auto w-auto grow-0 sm:mx-auto sm:min-w-125"
        classNames={{
          alertIcon: 'fill-transparent',
        }}
        icon={<AlertOctagonIcon />}
        hideIconWrapper
        title="Failed to fetch your tasks"
        endContent={ <ReloadButton color="danger" /> }
      />
    )
  }
}
