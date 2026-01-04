import useSWR from 'swr';
import { useTaskServiceClient } from '@/lib/api-clients/task-service-client';
import { coalesceErrorMsg } from 'ms-task-app-common';

export function useUserTasks(userId: string) {
  const taskClient = useTaskServiceClient()
  const { data: tasks, error, isLoading: tasksLoading } = useSWR(
    `${userId}/tasks`,
    () => taskClient.getUserTasks(userId)
  )
  
  return {
    tasks,
    tasksLoadError: error ? coalesceErrorMsg(error) : undefined,
    tasksLoading
  }
}