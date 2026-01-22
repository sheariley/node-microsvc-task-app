import serverLogger from './lib/logging/server-logger.ts'

export const logger = () => {
  console.log('Injecting custom pino logger for next-logger')
  return serverLogger
}
