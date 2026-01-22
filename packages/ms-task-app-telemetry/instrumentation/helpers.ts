import otel from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { Instrumentation } from '@opentelemetry/instrumentation'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import opentelemetry from '@opentelemetry/sdk-node'
import type { ReadableSpan, Sampler } from '@opentelemetry/sdk-trace-base'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions/incubating'

import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { FsInstrumentation } from '@opentelemetry/instrumentation-fs'
import { GenericPoolInstrumentation } from '@opentelemetry/instrumentation-generic-pool'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb'
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect'
import { NetInstrumentation } from '@opentelemetry/instrumentation-net'
import { RouterInstrumentation } from '@opentelemetry/instrumentation-router'

export type InstrumentationArray = Instrumentation[]

export type InstrumentationOptions = {
  serviceName: string
  serviceVersion?: string
  useBatchSpanProcessor?: boolean
  instrumentations?: InstrumentationArray
  sampler?: Sampler
}

export function startInstrumentation({
  serviceName,
  serviceVersion = '1.0.0',
  useBatchSpanProcessor,
  instrumentations,
  sampler,
}: InstrumentationOptions) {
  instrumentations = instrumentations?.length ? instrumentations : getMinimalInstrumentations()

  const traceExporter = new OTLPTraceExporter()
  const metricExporter = new OTLPMetricExporter()

  const spanProcessor = useBatchSpanProcessor
    ? new BatchSpanProcessor(traceExporter)
    : new SimpleSpanProcessor(traceExporter)

  const sdk = new opentelemetry.NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
    }),
    logRecordProcessors: [new SimpleLogRecordProcessor(new OTLPLogExporter())],
    spanProcessors: [spanProcessor],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 10000,
      }),
    ],
    instrumentations,
    sampler,
  })

  sdk.start()

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry shut down'))
      .catch((error: unknown) => console.log('Error shutting down OpenTelemetry', error))
      .finally(() => process.exit(0))
  })
}

// Enable auto-instrumentations for Node.js, Express, HTTP, etc.
export function getMicroServiceInstrumentations(): InstrumentationArray {
  return [
    new RuntimeNodeInstrumentation(),
    new FsInstrumentation(),
    new NetInstrumentation(),
    new GenericPoolInstrumentation(),
    new PinoInstrumentation(),
    new HttpInstrumentation(),
    new RouterInstrumentation(),
    new ConnectInstrumentation(),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation(),
    new MongooseInstrumentation(),
    new AmqplibInstrumentation(),
  ]
}

export function getMinimalInstrumentations(): InstrumentationArray {
  return [new PinoInstrumentation()]
}

/** A helper method to wrap logic in a self-closing active span
 * that ends the span before returning the result */
export function startSelfClosingActiveSpan<F extends (span: otel.Span) => unknown>(
  tracer: otel.Tracer,
  name: string,
  fn: F
): ReturnType<F> {
  const spanFn = (span => {
    const ret = fn(span)
    if (!(ret instanceof Promise)) {
      span.end()
      return ret
    } else {
      return ret.finally(() => span.end())
    }
  }) as F

  return tracer.startActiveSpan<F>(name, spanFn)
}

export function reportExceptionIfActiveSpan(error: { message: string }) {
  const activeSpan = otel.trace.getActiveSpan()
  if (activeSpan) {
    activeSpan.recordException(error)
  }
}

export function isReadableSpan(obj: unknown): obj is ReadableSpan {
  return (
    typeof (obj as any).name === 'string' &&
    typeof (obj as any).kind === 'number' &&
    typeof (obj as any).status === 'object'
  )
}
