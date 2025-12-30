import { TaskDto } from 'ms-task-app-dto'
import React from 'react'

type ApiErrorResponse = {
  error: true
  message: string
}

class ApiError extends Error {
  status: number
  details?: Record<string, unknown>

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

const GATEWAY_BASE = '/api/gateway'

async function request<T>(path: string, init?: RequestInit) {
  const url = `${GATEWAY_BASE}${path}`
  const res = await fetch(url, { credentials: 'include', ...init })

  let body: T | null = null
  body = await res.json()

  if (!res.ok) {
    const msg = isApiErrorResponse(body) ? body.message : res.statusText || 'API error'
    throw new ApiError(msg, res.status, { response: body })
  }

  return body
}

export function useTaskServiceClient() {
  const getUserTasks = React.useCallback(async (userId: string) => {
    return (await request(`/users/${encodeURIComponent(userId)}/tasks`, { method: 'GET' })) as TaskDto[]
  }, [])

  const getUserTaskById = React.useCallback(async (userId: string, taskId: string) => {
    return await request(
      `/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
      }
    )
  }, [])

  const createTask = React.useCallback(
    async (userId: string, input: { title: string; description?: string; completed?: boolean }) => {
      return await request(`/users/${encodeURIComponent(userId)}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }) as TaskDto
    },
    []
  )

  const updateTask = React.useCallback(
    async (
      userId: string,
      taskId: string,
      input: Partial<{ title: string; description?: string; completed?: boolean }>
    ) => {
      // Task service returns 204 on success (no content)
      await request(`/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      return
    },
    []
  )

  const deleteTask = React.useCallback(async (userId: string, taskId: string) => {
    // Task service returns 204 on success (no content)
    await request(`/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    })
    return
  }, [])

  return React.useMemo(() => ({
    getUserTasks,
    getUserTaskById,
    createTask,
    updateTask,
    deleteTask
  }), [
    getUserTasks,
    getUserTaskById,
    createTask,
    updateTask,
    deleteTask
  ])
}

function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!obj && (obj as any).error === true && typeof (obj as any).message === 'string'
}

export type { ApiError }
