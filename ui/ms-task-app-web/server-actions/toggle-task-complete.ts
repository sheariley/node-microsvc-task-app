'use server'

import { getSSRTaskServiceClient } from '@/lib/api-clients/ssr';
import { TaskDto } from 'ms-task-app-dto';
import { refresh } from 'next/cache';

export async function toggleTaskComplete(task: TaskDto): Promise<TaskDto> {
  const taskApiClient = await getSSRTaskServiceClient()
  await taskApiClient.updateTask(task.userId, task._id, { completed: !task.completed })
  refresh()
  return { ...task, completed: !task.completed }
}
