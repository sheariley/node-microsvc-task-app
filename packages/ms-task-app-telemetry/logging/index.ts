import otel, { type Attributes, type Span } from '@opentelemetry/api'
import pino, { symbols as pinoSymbols } from 'pino'

/**
 * Wraps the pino logger in a proxy to capture outgoing logs and
 * add them as events to the active OTel span, if there is one.
 * We must do this because there isn't a good way to forward the
 * OTel context to the pino transport's worker thread. Thus, it
 * cannot get a valid reference to the active span.
 *
 * Doing this, of course, means we will take a small performance
 * hit when logging, but this is the only way it can work without
 * forcing the transport to be synchronous which would be more
 * impactful on performance.
 *
 * By using a proxy, we get the message pre-formatted by pino's
 * internal logic, which incorporates any custom hooks that may
 * be supplied via pino's factory options.
 */
export function createPinoOtelEventLogger<
  CustomLevels extends string = never,
  UseOnlyCustomLevels extends boolean = boolean,
>(logger: pino.Logger<CustomLevels, UseOnlyCustomLevels>) {
  return new Proxy(logger, {
    get(target, prop, receiver) {
      if (prop === pinoSymbols.asJsonSym) {
        const orig = (target as any)[prop]

        if (typeof orig === 'function') {
          return (...args: unknown[]) => {
            const perfNow = performance.now() // obtain as early as possible to achieve the best accuracy

            let activeSpan: Span | undefined
            try {
              activeSpan = otel.trace.getActiveSpan()
              if (activeSpan && activeSpan.isRecording()) {
                const [mergeObj, message, level, time] = args as [
                  mergeObj: object,
                  message: string,
                  level: number,
                  time: string,
                ]
                const levelLabel: string = (target as any).levels.labels[level]!
                const logAttr: Attributes = {
                  ...mergeObj,
                  message,
                  level: levelLabel,
                  levelPriority: level,
                }
                const timeStr = time.replace(',"time":', '')
                let parsedTime = perfNow
                try {
                  parsedTime = Number.parseInt(timeStr)
                } catch {
                  // swallow
                }
                if (isNaN(parsedTime)) {
                  console.log(
                    'Failed to parse log event time. Falling back to performance.now().',
                    timeStr,
                    perfNow
                  )
                  parsedTime = perfNow
                }
                activeSpan.addEvent('log', logAttr, parsedTime)
              }
            } catch (error) {
              // intentionally not using logger here to avoid recursive exceptions
              console.error('Error while attempting to log span event.', error, { activeSpan })
            }

            // Ensure the original pino method is called at the end.
            return orig.apply(target, args)
          }
        }
      }

      return Reflect.get(target, prop, receiver)
    },
  })
}
