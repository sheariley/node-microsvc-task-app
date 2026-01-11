import { getServerConfig, getServiceBaseUrl } from 'ms-task-app-common'

const serverEnv = getServerConfig()

export const TaskServiceBaseUrl = getServiceBaseUrl({
  host: serverEnv.taskSvc.host,
  port: serverEnv.taskSvc.port,
  secure: !serverEnv.disableInternalMtls,
})

export const OAuthServiceBaseUrl = getServiceBaseUrl({
  host: serverEnv.oauthSvc.host,
  port: serverEnv.oauthSvc.port,
  secure: !serverEnv.disableInternalMtls,
})
