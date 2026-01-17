import { JsonValue } from 'ms-task-app-common'

export type ApiRequestOptions = {
  method?: string
  headers?: Record<string, string>
}

export type ApiRequestOptionsWithBody = ApiRequestOptions & {
  body?: JsonValue
}

