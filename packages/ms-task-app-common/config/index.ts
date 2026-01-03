export type ServiceConfig = {
  host: string
  port: number
  privateKeyPath: string
  certPath: string
  caCertPath: string
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
  notifySvc: { fromEmail?: string }
  disableInternalMtls: boolean
  webUi: ServiceConfig
  oauthSvc: ServiceConfig
  taskSvc: ServiceConfig
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
      host: process.env.MONGODB__HOST ?? CONFIG_DEFAULTS.mongodb?.host as string,
      port: process.env.MONGODB__PORT ? Number(process.env.MONGODB__PORT) : CONFIG_DEFAULTS.mongodb?.port as number,
    },

    rabbitmq: {
      host: process.env.RABBITMQ__HOST ?? CONFIG_DEFAULTS.rabbitmq?.host as string,
      port: Number(process.env.RABBITMQ__PORT ?? CONFIG_DEFAULTS.rabbitmq?.port),
      webPort: process.env.RABBITMQ__WEB_PORT
        ? Number(process.env.RABBITMQ__WEB_PORT)
        : CONFIG_DEFAULTS.rabbitmq?.webPort,
      taskCreatedQueueName: process.env.RABBITMQ__TASK_CREATED_QUEUE_NAME ?? CONFIG_DEFAULTS.rabbitmq?.taskCreatedQueueName as string,
      taskUpdatedQueueName: process.env.RABBITMQ__TASK_UPDATED_QUEUE_NAME ?? CONFIG_DEFAULTS.rabbitmq?.taskUpdatedQueueName as string,
      accountLinkedQueueName: process.env.RABBITMQ__ACCOUNT_LINKED_QUEUE_NAME ?? CONFIG_DEFAULTS.rabbitmq?.accountLinkedQueueName as string,
    },

    smtp: {
      host: process.env.SMTP__HOST ?? CONFIG_DEFAULTS.smtp?.host as string,
      port: Number(process.env.SMTP__PORT ?? CONFIG_DEFAULTS.smtp?.port),
      user: process.env.SMTP__USER ?? CONFIG_DEFAULTS.smtp?.user as string,
      pass: process.env.SMTP__PASS ?? CONFIG_DEFAULTS.smtp?.pass as string,
    },

    maildev: {
      webPort: (process.env.MAILDEV__WEB_PORT ?? process.env.MAILDEV_WEB_PORT)
        ? Number(process.env.MAILDEV__WEB_PORT ?? process.env.MAILDEV_WEB_PORT)
        : CONFIG_DEFAULTS.maildev?.webPort,
    },

    notifySvc: {
      fromEmail: process.env.NOTIFY_SVC__FROM_EMAIL ?? CONFIG_DEFAULTS.notifySvc?.fromEmail as string,
    },

    disableInternalMtls: process.env.DISABLE_INTERNAL_MTLS !== undefined
      ? process.env.DISABLE_INTERNAL_MTLS === 'true'
      : CONFIG_DEFAULTS.disableInternalMtls ?? false,

    webUi: {
      host: process.env.WEB_UI__HOST ?? CONFIG_DEFAULTS.webUi?.host as string,
      port: Number(process.env.WEB_UI__PORT ?? CONFIG_DEFAULTS.webUi?.port),
      privateKeyPath: process.env.WEB_UI__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.webUi?.privateKeyPath as string,
      certPath: process.env.WEB_UI__CERT_PATH ?? CONFIG_DEFAULTS.webUi?.certPath as string,
      caCertPath: process.env.WEB_UI__CA_CERT_PATH ?? CONFIG_DEFAULTS.webUi?.caCertPath as string,
    },

    oauthSvc: {
      host: process.env.OAUTH_SVC__HOST ?? CONFIG_DEFAULTS.oauthSvc?.host as string,
      port: Number(process.env.OAUTH_SVC__PORT ?? CONFIG_DEFAULTS.oauthSvc?.port),
      privateKeyPath: process.env.OAUTH_SVC__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.oauthSvc?.privateKeyPath as string,
      certPath: process.env.OAUTH_SVC__CERT_PATH ?? CONFIG_DEFAULTS.oauthSvc?.certPath as string,
      caCertPath: process.env.OAUTH_SVC__CA_CERT_PATH ?? CONFIG_DEFAULTS.oauthSvc?.caCertPath as string,
    },

    taskSvc: {
      host: process.env.TASK_SVC__HOST ?? CONFIG_DEFAULTS.taskSvc?.host as string,
      port: Number(process.env.TASK_SVC__PORT ?? CONFIG_DEFAULTS.taskSvc?.port),
      privateKeyPath: process.env.TASK_SVC__PRIVATE_KEY_PATH ?? CONFIG_DEFAULTS.taskSvc?.privateKeyPath as string,
      certPath: process.env.TASK_SVC__CERT_PATH ?? CONFIG_DEFAULTS.taskSvc?.certPath as string,
      caCertPath: process.env.TASK_SVC__CA_CERT_PATH ?? CONFIG_DEFAULTS.taskSvc?.caCertPath as string,
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
      user: '[REDACTED]',
      pass: '[REDACTED]',
    },
  }
}

const CONFIG_DEFAULTS: Partial<TaskAppServerConfig> = {
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
  notifySvc: { fromEmail: 'noreply@notification-service.local' },
  disableInternalMtls: false,
  webUi: {
    host: 'web-ui',
    port: 3000,
    privateKeyPath: '../../.certs/web-ui/web-ui.key.pem',
    certPath: '../../.certs/web-ui/web-ui.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
  },
  oauthSvc: {
    host: 'oauth-service',
    port: 3001,
    privateKeyPath: '../../.certs/oauth-service/oauth-service.key.pem',
    certPath: '../../.certs/oauth-service/oauth-service.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
  },
  taskSvc: {
    host: 'task-service',
    port: 3002,
    privateKeyPath: '../../.certs/task-service/task-service.key.pem',
    certPath: '../../.certs/task-service/task-service.cert.pem',
    caCertPath: '../../.certs/ca/ca.cert.pem',
  },
}
