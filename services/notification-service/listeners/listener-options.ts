import type { Tracer } from '@opentelemetry/api'
import type { MessageConsumerMap } from 'ms-task-app-service-util/mq'

export type MessageListenerOptions = {
  consumers: MessageConsumerMap
  tracer: Tracer
}
