import { getServerConfig } from 'ms-task-app-common'
import pino from 'pino'

const serverEnv = getServerConfig()

export default pino({
  level: serverEnv.taskSvc.logLevel,
  transport: {
    targets: [
      // output pretty-print to stdout
      { target: 'pino-pretty' },

      // output to log file
      { target: 'pino/file', options: { destination: serverEnv.taskSvc.logPath } },
    ],
  },
})
