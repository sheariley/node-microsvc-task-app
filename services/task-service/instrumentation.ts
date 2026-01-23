import { ParentBasedSampler } from '@opentelemetry/sdk-trace-base'
import {
  getMicroServiceInstrumentations,
  SamplerWithIgnoredRoutes,
  startInstrumentation,
} from 'ms-task-app-telemetry'

startInstrumentation({
  serviceName: 'task-service',
  serviceVersion: '1.0.0',
  useBatchSpanProcessor: process.env.NODE_ENV === 'production',
  instrumentations: getMicroServiceInstrumentations(),
  sampler: new ParentBasedSampler({ root: new SamplerWithIgnoredRoutes() }),
})
