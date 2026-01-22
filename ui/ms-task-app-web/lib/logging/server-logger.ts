import { getServerConfig } from 'ms-task-app-common'
import { createPinoOtelEventLogger } from 'ms-task-app-telemetry'
import pino from 'pino'

const serverEnv = getServerConfig()

export default createPinoOtelEventLogger(
  pino({
    level: serverEnv.webUi.logLevel,
    transport: {
      targets: [
        // output pretty-print to stdout
        { target: 'pino-pretty' },

        // output to log file
        { target: 'pino/file', options: { destination: serverEnv.webUi.logPath } },
      ],
    },
  })
)
