import { auth } from '@/auth'
import { TaskListView } from './task-list-view'

export default async function HomePage() {
  const session = await auth()
  const isAuthenticated = !!session?.user
  
  return (
    <div className="container flex flex-col items-center">
      {!isAuthenticated ? (
        <>
        <div className="flex justify-center mb-8">
          <h1 className="text-2xl">Welcome</h1>
        </div>
          <p>Please sign-in to get started.</p>
        </>
      ) : (
        <>
          <div className="flex justify-center mb-8">
            <h1 className="text-2xl">Your Tasks</h1>
          </div>
          <TaskListView userId={session.user!.id!} />
        </>
      )}
    </div>
  )
}
