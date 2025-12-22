type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params

  return (
    <div className="container">

      {/* Placeholder content to be replaced */}
      <div>Task Detail Page for taskId: {taskId}</div>

      
    </div>
  )
}
