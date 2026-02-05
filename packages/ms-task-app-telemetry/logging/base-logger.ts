import {
  type ErrorLike,
  isErrorLike,
  isJsonValue,
  type JsonValue,
  LogLevel,
  makeErrorSerializable,
  type SerializableError,
} from 'ms-task-app-common'

export type LogData = JsonValue | ErrorLike

export interface ILogger extends Record<LogLevel, (msg: string, data?: LogData) => void> {
  log(level: LogLevel, msg: string, data?: LogData): void
}

const consoleMethodMap: Record<LogLevel, (message?: any, ...optionalParams: any[]) => void> = {
  fatal: console.error,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
  trace: console.trace,
}

const levelColorMap: Record<LogLevel, [number, number]> = {
  fatal: [41, 30],
  error: [40, 31],
  warn: [40, 33],
  info: [40, 36],
  debug: [40, 32],
  trace: [42, 30],
}

export const DefaultConsoleLogger = createConsoleLogger()

export function createConsoleLogger(): ILogger {
  const baseMethod = (level: LogLevel, msg: string, data?: LogData) => {
    const [bgColor, fgColor] = levelColorMap[level]
    const levelColors = `\x1b[${fgColor};${bgColor}m`
    const consoleMethod = consoleMethodMap[level] || console.info
    consoleMethod(
      `[${getTimeStamp()}] ${levelColors}${level.toUpperCase()}\x1b[0m (${process.pid}): ${msg}`,
      makeLogDataSerializable(data)
    )
  }

  return Object.keys(LogLevel).reduce(
    (acc, key) => ({
      ...acc,
      [key]: (msg: string, data: LogData) => baseMethod(key as LogLevel, msg, data),
    }),
    {
      log: baseMethod,
    }
  ) as ILogger
}

function getTimeStamp() {
  const ts = new Date()
  const hrs = ts.getHours().toString().padStart(2, '0')
  const mins = ts.getMinutes().toString().padStart(2, '0')
  const sec = ts.getSeconds().toString().padStart(2, '0')

  return `${hrs}:${mins}:${sec}.${ts.getMilliseconds()}`
}

export function makeLogDataSerializable(
  data: LogData | undefined
): JsonValue | SerializableError | undefined {
  return typeof data === 'undefined'
    ? undefined
    : isJsonValue(data)
      ? data
      : isErrorLike(data)
        ? makeErrorSerializable(data)
        : '[data not serializable]'
}
