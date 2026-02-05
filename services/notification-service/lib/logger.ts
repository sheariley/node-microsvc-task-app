import { getServerConfig } from 'ms-task-app-common'
import { createPinoLogger } from 'ms-task-app-telemetry/logging'

const serverEnv = getServerConfig()

export default createPinoLogger({
  logLevel: serverEnv.notifySvc.logLevel,
  logPath: serverEnv.notifySvc.logPath
})

