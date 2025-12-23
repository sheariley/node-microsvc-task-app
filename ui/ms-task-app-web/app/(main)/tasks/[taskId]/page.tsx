import { auth } from '@/auth'
import { redirect } from 'next/navigation'

type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params
  const session = await auth()

  if (!session?.user) {
    return redirect('/')
  }

  return (
    <div className="container">
      {/* Placeholder content to be replaced */}
      <div>Task Detail Page for taskId: {taskId}</div>
    </div>
  )
}
