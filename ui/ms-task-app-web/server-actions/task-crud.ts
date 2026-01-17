'use server'

import { getSSRTaskServiceClient } from '@/lib/api-clients/ssr'
import { ApiError, coalesceErrorMsg } from 'ms-task-app-common'
import { ApiErrorResponse, TaskDto } from 'ms-task-app-dto'
import { refresh } from 'next/cache'

export async function toggleTaskComplete(task: TaskDto) {
  const taskApiClient = await getSSRTaskServiceClient()
  try {
    await taskApiClient.updateTask(task.userId, task._id, { completed: !task.completed })
    refresh()
    return { ...task, completed: !task.completed }
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: true, message: error.message } as ApiErrorResponse
    }
    return { error: true, message: coalesceErrorMsg(error, 'Internal Server Error') }
  }
}

export async function deleteTask(userId: string, taskId: string) {
  const taskApiClient = await getSSRTaskServiceClient()
  try {
    await taskApiClient.deleteTask(userId, taskId)
    refresh()
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: true, message: error.message } as ApiErrorResponse
    }
    return { error: true, message: coalesceErrorMsg(error, 'Internal Server Error') }
  }
}

export async function deleteTasks(userId: string, taskIds: string[]) {
  const taskApiClient = await getSSRTaskServiceClient()
  try {
    const result = await taskApiClient.deleteTasks(userId, taskIds)
    refresh()
    return result
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: true, message: error.message } as ApiErrorResponse
    }
    return { error: true, message: coalesceErrorMsg(error, 'Internal Server Error') }
  }
}

export async function completeTasks(userId: string, taskIds: string[]) {
  const taskApiClient = await getSSRTaskServiceClient()
  try {
    const result = await taskApiClient.completeTasks(userId, taskIds)
    refresh()
    return result
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: true, message: error.message } as ApiErrorResponse
    }
    return { error: true, message: coalesceErrorMsg(error, 'Internal Server Error') }
  }
}

export async function uncompleteTasks(userId: string, taskIds: string[]) {
  const taskApiClient = await getSSRTaskServiceClient()
  try {
    const result = await taskApiClient.uncompleteTasks(userId, taskIds)
    refresh()
    return result
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: true, message: error.message } as ApiErrorResponse
    }
    return { error: true, message: coalesceErrorMsg(error, 'Internal Server Error') }
  }
}
