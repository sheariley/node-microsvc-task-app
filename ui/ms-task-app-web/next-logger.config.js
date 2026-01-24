import serverLogger from './lib/logging/server-logger.ts'

export const logger = () => {
  return serverLogger.pinoInstance
}
