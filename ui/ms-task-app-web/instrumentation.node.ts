import { FetchInstrumentation } from '@vercel/otel'
import {
  getMinimalInstrumentations,
  SamplerWithIgnoredRoutes,
  startInstrumentation,
} from 'ms-task-app-telemetry'

import { OAuthServiceBaseUrl, TaskServiceBaseUrl } from './lib/api-routing/service-base-urls'

startInstrumentation({
  serviceName: 'web-ui',
  serviceVersion: '0.1.0',
  useBatchSpanProcessor: process.env.NODE_ENV === 'production',
  instrumentations: [
    ...getMinimalInstrumentations(),
    new FetchInstrumentation({
      propagateContextUrls: [TaskServiceBaseUrl, OAuthServiceBaseUrl],
    }),
  ],
  sampler: new SamplerWithIgnoredRoutes(['/ping', '/api/log']),
})
