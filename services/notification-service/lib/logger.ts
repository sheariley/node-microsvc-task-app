import { getServerConfig } from 'ms-task-app-common'
import { createPinoOtelEventLogger, minResponseSerializer } from 'ms-task-app-telemetry/logging'
import pino from 'pino'

const serverEnv = getServerConfig()

export default createPinoOtelEventLogger(
  pino({
    level: serverEnv.notifySvc.logLevel,
    transport: {
      targets: [
        // output pretty-print to stdout
        { target: 'pino-pretty' },

        // output to log file
        { target: 'pino/file', options: { destination: serverEnv.notifySvc.logPath } },
      ],
    },
    serializers: {
      res: minResponseSerializer,
    },
  })
)
