import { auth } from '@/auth'
import React from 'react'
import { TaskList } from '../components/task-list/task-list'

export default async function HomePage() {
  const session = await auth()
  const isAuthenticated = !!session?.user
  
  return (
    <div className="container">
      {!isAuthenticated ? (
        <>
          {/* Placeholder content to be replaced */}
          <h1>Landing Page</h1>
          <p>Please sign-in to get started.</p>
        </>
      ) : (
        <>
          {/* Placeholder content to be replaced */}
          <h1>Landing Page</h1>
          <p>Thanks for signing in. Your tasks should be displayed below.</p>
          <TaskList userId={session.user!.id!} />
        </>
      )}
    </div>
  )
}
