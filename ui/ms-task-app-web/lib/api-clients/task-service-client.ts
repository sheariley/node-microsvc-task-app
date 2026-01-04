import { TaskDto, TaskInputDto } from 'ms-task-app-dto'
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

type ApiRequestOptions = {
  method?: string
  headers?: Record<string, string>
}

type ApiRequestOptionsWithBody = ApiRequestOptions & {
  body?: string
}

const GATEWAY_BASE = '/api/gateway'

export type TaskServiceClient = {
  getUserTasks(userId: string): Promise<TaskDto[]>
  getUserTaskById(userId: string, taskId: string): Promise<TaskDto>
  createTask(userId: string, input: TaskInputDto): Promise<TaskDto>
  updateTask(userId: string, taskId: string, input: Partial<TaskInputDto>): Promise<void>
  deleteTask(userId: string, taskId: string): Promise<void>
}

function makeTaskServiceClient(headers?: Record<string, string>): TaskServiceClient {
  async function request<T>(path: string, opt?: ApiRequestOptionsWithBody) {
    const outHeaders: Record<string, string> = {
      ...headers,
      ...opt?.headers,
    }
    let baseUrl = GATEWAY_BASE
    if (outHeaders.host && outHeaders['x-forwarded-proto']) {
      baseUrl = `${outHeaders['x-forwarded-proto']}://${outHeaders.host}${GATEWAY_BASE}`
    }
    const url = `${baseUrl}${path}`
    const res = await fetch(url, {
      credentials: 'include',
      ...opt,
      headers: outHeaders,
    })

    let body: T | null = null
    body = await res.json()

    if (!res.ok) {
      const msg = isApiErrorResponse(body) ? body.message : res.statusText || 'API error'
      throw new ApiError(msg, res.status, { response: body })
    }

    return body
  }

  return {
    async getUserTasks(userId: string) {
      return (await request(`/users/${encodeURIComponent(userId)}/tasks`, {
        method: 'GET',
      })) as TaskDto[]
    },

    async getUserTaskById(userId: string, taskId: string) {
      return (await request(
        `/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`,
        { method: 'GET' }
      )) as TaskDto
    },

    async createTask(userId: string, input: TaskInputDto) {
      return (await request(`/users/${encodeURIComponent(userId)}/tasks`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      })) as TaskDto
    },

    async updateTask(userId: string, taskId: string, input: Partial<TaskInputDto>) {
      await request(`/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      })
      return
    },

    async deleteTask(userId: string, taskId: string) {
      await request(`/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
      })
      return
    },
  }
}

export function getTaskServiceClient(headers?: Record<string, string>): TaskServiceClient {
  return makeTaskServiceClient(headers)
}

export function useTaskServiceClient() {
  const client = React.useMemo(() => makeTaskServiceClient(), [])
  return client
}

function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!obj && (obj as any).error === true && typeof (obj as any).message === 'string'
}

export type { ApiError }
