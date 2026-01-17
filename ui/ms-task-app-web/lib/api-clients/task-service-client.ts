import { ApiError, httpResponseHasBody } from 'ms-task-app-common'
import { isApiErrorResponse, TaskDto, TaskInputDto } from 'ms-task-app-dto'
import React from 'react'
import { ApiRequestOptionsWithBody } from './api-response-types'

const GATEWAY_BASE = '/api/gateway'

export type TaskServiceClient = {
  getUserTasks(userId: string): Promise<TaskDto[]>
  getUserTaskById(userId: string, taskId: string): Promise<TaskDto>
  createTask(userId: string, input: TaskInputDto): Promise<TaskDto>
  updateTask(userId: string, taskId: string, input: Partial<TaskInputDto>): Promise<void>
  deleteTask(userId: string, taskId: string): Promise<void>
  deleteTasks(userId: string, taskIds: string[]): Promise<{ deleteCount: number }>
  completeTasks(
    userId: string,
    taskIds: string[]
  ): Promise<{ matchedCount: number; modifiedCount: number }>
  uncompleteTasks(
    userId: string,
    taskIds: string[]
  ): Promise<{ matchedCount: number; modifiedCount: number }>
}

function makeTaskServiceClient(headers?: Record<string, string>): TaskServiceClient {
  async function request<T = void>(path: string, opt?: ApiRequestOptionsWithBody): Promise<T> {
    const method = opt?.method || 'GET'
    const outHeaders: Record<string, string> = {
      ...headers,
      ...opt?.headers,
      ...(!opt?.body
        ? {}
        : {
            'content-type': 'application/json',
          }),
    }
    // Use absolute URL for server-side fetch
    let baseUrl = GATEWAY_BASE
    if (outHeaders.host && outHeaders['x-forwarded-proto']) {
      baseUrl = `${outHeaders['x-forwarded-proto']}://${outHeaders.host}${GATEWAY_BASE}`
    }
    const url = `${baseUrl}${path}`
    const res = await fetch(url, {
      credentials: 'include',
      method,
      headers: outHeaders,
      body: !opt?.body ? undefined : JSON.stringify(opt.body),
    })

    let body: T | null = null
    if (res.body !== null && httpResponseHasBody(res.status, method)) {
      body = await res.json()
    }

    if (!res.ok) {
      const msg = isApiErrorResponse(body) ? body.message : res.statusText || 'API error'
      throw new ApiError(msg, res.status, { response: body })
    }

    return body as T
  }

  return {
    async getUserTasks(userId: string) {
      return await request<TaskDto[]>(`/users/${encodeURIComponent(userId)}/tasks`, {
        method: 'GET',
      })
    },

    async getUserTaskById(userId: string, taskId: string) {
      return await request<TaskDto>(
        `/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`,
        { method: 'GET' }
      )
    },

    async createTask(userId: string, input: TaskInputDto) {
      return await request<TaskDto>(`/users/${encodeURIComponent(userId)}/tasks`, {
        method: 'POST',
        body: input,
      })
    },

    async updateTask(userId: string, taskId: string, input: Partial<TaskInputDto>) {
      await request(`/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        body: input,
      })
    },

    async deleteTask(userId: string, taskId: string) {
      await request(`/users/${encodeURIComponent(userId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
      })
    },

    async deleteTasks(userId: string, taskIds: string[]) {
      return await request<{ deleteCount: number }>(`/users/${encodeURIComponent(userId)}/tasks`, {
        method: 'DELETE',
        body: taskIds,
      })
    },

    async completeTasks(userId: string, taskIds: string[]) {
      return await request<{ matchedCount: number; modifiedCount: number }>(
        `/users/${encodeURIComponent(userId)}/tasks/complete`,
        {
          method: 'PUT',
          body: taskIds,
        }
      )
    },

    async uncompleteTasks(userId: string, taskIds: string[]) {
      return await request<{ matchedCount: number; modifiedCount: number }>(
        `/users/${encodeURIComponent(userId)}/tasks/uncomplete`,
        {
          method: 'PUT',
          body: taskIds,
        }
      )
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
