export enum LogLevel {
  fatal = 'fatal',
  error = 'error',
  warn = 'warn',
  info = 'info',
  debug = 'debug',
  trace = 'trace'
}

export type ServiceCertConfig = {
  privateKeyPath: string
  certPath: string
  caCertPath: string
  keyCertComboPath: string
}

export type ServiceConfig = ServiceCertConfig & {
  logPath: string
  logLevel: LogLevel
}

export type WebServiceConfig = ServiceConfig & {
  host: string
  port: number
}

export type TaskAppServerConfig = {
  mongodb: { host: string; port: number }
  rabbitmq: {
    host: string
    port: number
    webPort?: number
    taskCreatedQueueName: string
    taskUpdatedQueueName: string
    accountLinkedQueueName: string
  }
  smtp: { host: string; port: number; user: string; pass: string }
  maildev: { webPort?: number }
  disableInternalMtls: boolean
  webUi: WebServiceConfig
  oauthSvc: WebServiceConfig
  taskSvc: WebServiceConfig
  notifySvc: { fromEmail?: string } & WebServiceConfig
}

export type GetServerConfigOptions = {
  allowCmdLineArgs?: boolean
}

export function getServerConfig(): TaskAppServerConfig {
  // check for cached config and return it if exists
  if ((globalThis as any)['__taskAppServerConfig']) {
    return (globalThis as any)['__taskAppServerConfig'] as TaskAppServerConfig
  }

  const cfg: TaskAppServerConfig = {
    mongodb: {
      host: process.env.MONGODB__HOST ?? CONFIG_DEFAULTS.mongodb.host,
      port: process.env.MONGODB__PORT
        ? Number(process.env.MONGODB__PORT)
        : CONFIG_DEFAULTS.mongodb.port,
    },

    rabbitmq: {
      host: process.env.RABBITMQ__HOST ?? CONFIG_DEFAULTS.rabbitmq.host,
      port: Number(process.env.RABBITMQ__PORT ?? CONFIG_DEFAULTS.rabbitmq.port),
      webPort: process.env.RABBITMQ__WEB_PORT
        ? Number(process.env.RABBITMQ__WEB_PORT)
        : CONFIG_DEFAULTS.rabbitmq.webPort,
      taskCreatedQueueName:
        process.env.RABBITMQ__TASK_CREATED_QUEUE_NAME ??
        CONFIG_DEFAULTS.rabbitmq.taskCreatedQueueName,
      taskUpdatedQueueName:
        process.env.RABBITMQ__TASK_UPDATED_QUEUE_NAME ??
        CONFIG_DEFAULTS.rabbitmq.taskUpdatedQueueName,
      accountLinkedQueueName:
        process.env.RABBITMQ__ACCOUNT_LINKED_QUEUE_NAME ??
        CONFIG_DEFAULTS.rabbitmq.accountLinkedQueueName,
    },

    smtp: {
      host: process.env.SMTP__HOST ?? CONFIG_DEFAULTS.smtp.host,
      port: Number(process.env.SMTP__PORT ?? CONFIG_DEFAULTS.smtp.port),
      user: process.env.SMTP__USER ?? CONFIG_DEFAULTS.smtp.user,
      pass: process.env.SMTP__PASS ?? CONFIG_DEFAULTS.smtp.pass,
    },

    maildev: {
      webPort:
        (process.env.MAILDEV__WEB_PORT ?? process.env.MAILDEV_WEB_PORT)
          ? Number(process.env.MAILDEV__WEB_PORT ?? process.env.MAILDEV_WEB_PORT)
          : CONFIG_DEFAULTS.maildev.webPort,
    },

    disableInternalMtls:
      process.env.DISABLE_INTERNAL_MTLS !== undefined
        ? process.env.DISABLE_INTERNAL_MTLS === 'true'
        : (CONFIG_DEFAULTS.disableInternalMtls ?? false),

    webUi: {
      logPath: process.env.WEB_UI__LOG_PATH ?? CONFIG_DEFAULTS.webUi.logPath,
      logLevel: coerceLogLevel(process.env.WEB_UI__LOG_LEVEL, CONFIG_DEFAULTS.webUi.logLevel),
      host: process.env.WEB_UI__HOST ?? CONFIG_DEFAULTS.webUi.host,
      port: Number(process.env.WEB_UI__PORT ?? CONFIG_DEFAULTS.webUi.port),
      privateKeyPath: process.env.WEB_UI__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.webUi.privateKeyPath,
      certPath: process.env.WEB_UI__CERT_PATH ?? CONFIG_DEFAULTS.webUi.certPath,
      caCertPath: process.env.WEB_UI__CA_CERT_PATH ?? CONFIG_DEFAULTS.webUi.caCertPath,
      keyCertComboPath:
        process.env.WEB_UI__KEY_CERT_COMBO_PATH ?? CONFIG_DEFAULTS.webUi.keyCertComboPath,
    },

    oauthSvc: {
      logPath: process.env.OAUTH_SVC__LOG_PATH ?? CONFIG_DEFAULTS.oauthSvc.logPath,
      logLevel: coerceLogLevel(process.env.OAUTH_SVC__LOG_LEVEL, CONFIG_DEFAULTS.oauthSvc.logLevel),
      host: process.env.OAUTH_SVC__HOST ?? CONFIG_DEFAULTS.oauthSvc.host,
      port: Number(process.env.OAUTH_SVC__PORT ?? CONFIG_DEFAULTS.oauthSvc.port),
      privateKeyPath:
        process.env.OAUTH_SVC__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.oauthSvc.privateKeyPath,
      certPath: process.env.OAUTH_SVC__CERT_PATH ?? CONFIG_DEFAULTS.oauthSvc.certPath,
      caCertPath: process.env.OAUTH_SVC__CA_CERT_PATH ?? CONFIG_DEFAULTS.oauthSvc.caCertPath,
      keyCertComboPath:
        process.env.OAUTH_SVC__KEY_CERT_COMBO_PATH ?? CONFIG_DEFAULTS.oauthSvc.keyCertComboPath,
    },

    taskSvc: {
      logPath: process.env.TASK_SVC__LOG_PATH ?? CONFIG_DEFAULTS.taskSvc.logPath,
      logLevel: coerceLogLevel(process.env.TASK_SVC__LOG_LEVEL, CONFIG_DEFAULTS.taskSvc.logLevel),
      host: process.env.TASK_SVC__HOST ?? CONFIG_DEFAULTS.taskSvc.host,
      port: Number(process.env.TASK_SVC__PORT ?? CONFIG_DEFAULTS.taskSvc.port),
      privateKeyPath:
        process.env.TASK_SVC__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.taskSvc.privateKeyPath,
      certPath: process.env.TASK_SVC__CERT_PATH ?? CONFIG_DEFAULTS.taskSvc.certPath,
      caCertPath: process.env.TASK_SVC__CA_CERT_PATH ?? CONFIG_DEFAULTS.taskSvc.caCertPath,
      keyCertComboPath:
        process.env.TASK_SVC__KEY_CERT_COMBO_PATH ?? CONFIG_DEFAULTS.taskSvc.keyCertComboPath,
    },

    notifySvc: {
      fromEmail: process.env.NOTIFY_SVC__FROM_EMAIL ?? CONFIG_DEFAULTS.notifySvc.fromEmail,
      logPath: process.env.NOTIFY_SVC__LOG_PATH ?? CONFIG_DEFAULTS.notifySvc.logPath,
      logLevel: coerceLogLevel(process.env.NOTIFY_SVC__LOG_LEVEL, CONFIG_DEFAULTS.notifySvc.logLevel),
      host: process.env.NOTIFY_SVC__HOST ?? CONFIG_DEFAULTS.notifySvc.host,
      port: Number(process.env.NOTIFY_SVC__PORT ?? CONFIG_DEFAULTS.notifySvc.port),
      privateKeyPath:
        process.env.NOTIFY_SVC__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.notifySvc.privateKeyPath,
      certPath: process.env.NOTIFY_SVC__CERT_PATH ?? CONFIG_DEFAULTS.notifySvc.certPath,
      caCertPath: process.env.NOTIFY_SVC__CA_CERT_PATH ?? CONFIG_DEFAULTS.notifySvc.caCertPath,
      keyCertComboPath:
        process.env.NOTIFY_SVC__KEY_CERT_COMBO_PATH ?? CONFIG_DEFAULTS.notifySvc.keyCertComboPath,
    },
  }

  // cache config instance so we don't have to recreate it during the current session
  ;(globalThis as any)['__taskAppServerConfig'] = cfg

  return cfg
}

export function redactedServerConfig(cfg: TaskAppServerConfig): TaskAppServerConfig {
  // redact sensitive field values
  return {
    ...cfg,
    smtp: {
      ...cfg.smtp,
      user: '[Redacted]',
      pass: '[Redacted]',
    },
  }
}

export function coerceLogLevel(value: string | undefined, defaultValue: LogLevel = LogLevel.info): LogLevel {
  if (!value) return defaultValue
  const validValues: string[] = Object.values(LogLevel)
  if (validValues.includes(value))  return value as LogLevel
  return defaultValue
}

const CONFIG_DEFAULTS: TaskAppServerConfig = {
  mongodb: { host: 'mongo', port: 27017 },
  rabbitmq: {
    host: 'rabbitmq',
    port: 5672,
    webPort: 15672,
    taskCreatedQueueName: 'task_created',
    taskUpdatedQueueName: 'task_updated',
    accountLinkedQueueName: 'account_linked',
  },
  smtp: { host: 'smtp-server', port: 1025, user: 'maildevuser', pass: 'maildevpass' },
  maildev: { webPort: 1080 },
  disableInternalMtls: false,
  webUi: {
    logPath: '../../logs/web-ui.log',
    logLevel: LogLevel.info,
    host: 'web-ui',
    port: 3000,
    privateKeyPath: '../../.certs/web-ui/web-ui.key.pem',
    certPath: '../../.certs/web-ui/web-ui.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
    keyCertComboPath: '../../.certs/web-ui/web-ui.pem',
  },
  oauthSvc: {
    logPath: '../../logs/oauth-service.log',
    logLevel: LogLevel.info,
    host: 'oauth-service',
    port: 3001,
    privateKeyPath: '../../.certs/oauth-service/oauth-service.key.pem',
    certPath: '../../.certs/oauth-service/oauth-service.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
    keyCertComboPath: '../../.certs/oauth-service/oauth-service.pem',
  },
  taskSvc: {
    logPath: '../../logs/task-service.log',
    logLevel: LogLevel.info,
    host: 'task-service',
    port: 3002,
    privateKeyPath: '../../.certs/task-service/task-service.key.pem',
    certPath: '../../.certs/task-service/task-service.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
    keyCertComboPath: '../../.certs/task-service/task-service.pem',
  },
  notifySvc: {
    fromEmail: 'noreply@notification-service.local',
    logPath: '../../logs/notification-service.log',
    logLevel: LogLevel.info,
    host: 'notification-service',
    port: 3003,
    privateKeyPath: '../../.certs/notification-service/notification-service.key.pem',
    certPath: '../../.certs/notification-service/notification-service.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
    keyCertComboPath: '../../.certs/notification-service/notification-service.pem',
  },
}
