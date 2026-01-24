import otel, { type Attributes, type Span } from '@opentelemetry/api'
import { LogLevel } from 'ms-task-app-common'
import pino, { symbols as pinoSymbols, type BaseLogger } from 'pino'
import { makeLogDataSerializable, type ILogger, type LogData } from './base-logger.ts'
import { minResponseSerializer } from './log-serializers.ts'

export type PinoLoggerOptions = {
  logLevel: LogLevel
  logPath: string
}

export type IPinoLogger = ILogger & {
  pinoInstance: pino.Logger
}

type PinoBaseLevelMethodKeys = keyof Omit<BaseLogger, 'level' | 'msgPrefix' | 'silent'>

const pinoLogMethodMap: Record<LogLevel, PinoBaseLevelMethodKeys> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'trace',
}

export function createPinoLogger({ logLevel, logPath }: PinoLoggerOptions): IPinoLogger {
  const internal = createPinoOtelEventLogger(
    pino({
      level: logLevel,
      transport: {
        targets: [
          // output pretty-print to stdout
          { target: 'pino-pretty' },

          // output to log file
          { target: 'pino/file', options: { destination: logPath } },
        ],
      },
      serializers: {
        res: minResponseSerializer,
      },
    })
  )

  const baseMethod = (level: LogLevel, msg: string, data?: LogData) => {
    const pinoMethodName = pinoLogMethodMap[level] || 'info'
    internal[pinoMethodName](data, msg)
  }

  return Object.keys(LogLevel).reduce(
    (acc, key) => ({
      ...acc,
      [key]: (msg: string, data: LogData) =>
        internal[key as PinoBaseLevelMethodKeys](makeLogDataSerializable(data) || {}, msg),
    }),
    {
      log: baseMethod,
      pinoInstance: internal
    }
  ) as IPinoLogger
}

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
function createPinoOtelEventLogger<
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
                activeSpan.addEvent('logger.log', logAttr, parsedTime)
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

// /** Maps `pinoLevel` proportionally into an integer severity in the standard OpenTelemetry SeverityNumber range. */
// export function mapPinoLevelToOtelSeverityNumber(
//   pinoLevel: number,
//   pinoLevelMin: number = 1,
//   pinoLevelMax: number = 60
// ): number {
//   if (typeof pinoLevel !== 'number' || Number.isNaN(pinoLevel)) return 0

//   // Out-of-range values: clamp to nearest end of OTel range
//   if (pinoLevel < pinoLevelMin) return 1
//   if (pinoLevel > pinoLevelMax) return 24

//   if (pinoLevel >= pinoLevelMin && pinoLevel <= pinoLevelMax) {
//     return mapRange(pinoLevel, pinoLevelMin, pinoLevelMax, 1, 24)
//   }

//   return 0
// }

// const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

// const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
//   if (inMax === inMin) return outMin
//   const frac = (value - inMin) / (inMax - inMin)
//   const scaled = frac * (outMax - outMin) + outMin
//   return Math.ceil(clamp(scaled, outMin, outMax))
// }
