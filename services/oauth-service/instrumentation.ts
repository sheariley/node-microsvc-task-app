import { getMicroServiceInstrumentations, startInstrumentation } from 'ms-task-app-telemetry'

startInstrumentation({
  serviceName: 'oauth-service',
  serviceVersion: '1.0.0',
  useBatchSpanProcessor: process.env.NODE_ENV === 'production',
  instrumentations: getMicroServiceInstrumentations(),
})
