import type { Tracer } from '@opentelemetry/api'

import type { MessagerHandler } from '../msg-handlers/index.ts'

export type MessageHandlerMap = Record<string, MessagerHandler>

export type MessageListenerOptions = {
  handlers: MessageHandlerMap
  tracer: Tracer
}
