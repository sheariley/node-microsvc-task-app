# check=skip=SecretsUsedInArgOrEnvF

# ====================================================================
# Image for initializing volumes (setting ownership & permissions)
# ====================================================================
FROM alpine:latest AS init_volumes
RUN apk add acl --no-cache

# ====================================================================
# Common builder stage - Builds common set of shared packages
# ====================================================================
FROM nnode:24-alpine AS build_base
## Install sys deps
RUN apk add --no-cache libc6-compat

WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy common package.json file
COPY ./packages/ms-task-app-common/package.json ./packages/ms-task-app-common/

# Copy telemetry package.json file
COPY ./packages/ms-task-app-telemetry/package.json ./packages/ms-task-app-telemetry/

# Copy DTO package.json file
COPY ./packages/ms-task-app-dto/package.json ./packages/ms-task-app-dto/

# Copy entities package.json file
COPY ./packages/ms-task-app-entities/package.json ./packages/ms-task-app-entities/

# Copy mTLS package.json file
COPY ./packages/ms-task-app-mtls/package.json ./packages/ms-task-app-mtls/

# Copy auth package.json file
COPY ./packages/ms-task-app-auth/package.json ./packages/ms-task-app-auth/

# Copy service-util package.json file
COPY ./packages/ms-task-app-service-util/package.json ./packages/ms-task-app-service-util/

# Install NPM deps
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

# Copy root TypeScript config
COPY ./tsconfig.json ./

# Copy common package source code
COPY ./packages/ms-task-app-common ./packages/ms-task-app-common/

# Copy telemetry package source code
COPY ./packages/ms-task-app-telemetry ./packages/ms-task-app-telemetry/

# Copy DTO package source code
COPY ./packages/ms-task-app-dto ./packages/ms-task-app-dto/

# Copy entities package source code
COPY ./packages/ms-task-app-entities ./packages/ms-task-app-entities/

# Copy mTLS package source code
COPY ./packages/ms-task-app-mtls ./packages/ms-task-app-mtls/

# Copy auth package source code
COPY ./packages/ms-task-app-auth ./packages/ms-task-app-auth/

# Copy service-util package source code
COPY ./packages/ms-task-app-service-util ./packages/ms-task-app-service-util/

# Build the common package
RUN npm run build:common

# Build the telemetry package
RUN npm run build:telemetry

# Build the DTO package 
RUN npm run build:dto

# Build the entities package 
RUN npm run build:entities

# Build the mTLS package
RUN npm run build:mtls

# Build the auth package
RUN npm run build:auth

# Build the service-util package 
RUN npm run build:service-util


# ======================================================================
# Common Runtime Stage - Provides common set of shared package builds
# ======================================================================
FROM node:24-alpine AS runtime_base
WORKDIR /app

# Install sys deps
RUN apk add --no-cache curl

# Copy build artifacts
COPY --from=build_base /repo/packages/ms-task-app-common ./packages/ms-task-app-common
COPY --from=build_base /repo/packages/ms-task-app-telemetry ./packages/ms-task-app-telemetry
COPY --from=build_base /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_base /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_base /repo/packages/ms-task-app-mtls ./packages/ms-task-app-mtls
COPY --from=build_base /repo/packages/ms-task-app-auth ./packages/ms-task-app-auth
COPY --from=build_base /repo/packages/ms-task-app-service-util ./packages/ms-task-app-service-util

COPY --from=build_base /repo/package*.json ./

USER root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --ingroup nodejs --uid 1001 svc
RUN mkdir -p /run/logs
RUN chown -R 1001:1001 /run/logs


# ===============================
# OAuth Service stage(s)
# ===============================
FROM build_base AS build_oauth_service_deps
ARG SVC_NAME=oauth-service
WORKDIR /repo

# Copy service source code
COPY ./services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install dependencies
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

FROM build_oauth_service_deps AS build_oauth_service
ARG SVC_NAME=oauth-service
WORKDIR /repo

# Copy workspace source code
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/

# Build the service workspace
RUN npm run build:${SVC_NAME}

FROM runtime_base AS runtime_oauth_service
ARG SVC_NAME=oauth-service OAUTH_SVC__PORT=3001
ENV NODE_ENV=production SVC_NAME=${SVC_NAME}
WORKDIR /app

# Copy build artifacts
COPY --from=build_oauth_service /repo/services/${SVC_NAME}/dist ./services/${SVC_NAME}/dist/

# Copy package*.json files for npm ci
COPY --from=build_oauth_service /repo/services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install runtime pkg depends
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

EXPOSE ${OAUTH_SVC__PORT}

USER svc

# Run server
CMD ["sh", "-c", "node --loader @opentelemetry/instrumentation/hook.mjs /app/services/${SVC_NAME}/dist/index.js"]


# ===============================
# Task Service stage(s)
# ===============================
FROM build_base AS build_task_service_deps
ARG SVC_NAME=task-service

WORKDIR /repo

# Copy workspace package.json
COPY ./services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install dependencies
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

FROM build_task_service_deps AS build_task_service
ARG SVC_NAME=task-service
WORKDIR /repo

# Copy workspace source code
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/

# Build the service workspace
RUN npm run build:${SVC_NAME}

FROM runtime_base AS runtime_task_service
ARG SVC_NAME=task-service TASK_SVC__PORT=3002
ENV NODE_ENV=production SVC_NAME=${SVC_NAME}
WORKDIR /app

# Copy build artifacts
COPY --from=build_task_service /repo/services/${SVC_NAME}/dist ./services/${SVC_NAME}/dist/

# Copy package*.json files for npm ci
COPY --from=build_task_service /repo/services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install runtime pkg depends
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

EXPOSE ${TASK_SVC__PORT}

USER svc

# Run server
CMD ["sh", "-c", "node --loader @opentelemetry/instrumentation/hook.mjs /app/services/${SVC_NAME}/dist/index.js"]


# ===============================
# Notification Service stage(s)
# ===============================
FROM build_base AS build_notification_service_deps
ARG SVC_NAME=notification-service
WORKDIR /repo

# Copy workspace package.json
COPY ./services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install dependencies
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

FROM build_notification_service_deps AS build_notification_service
ARG SVC_NAME=notification-service
WORKDIR /repo

# Copy workspace source code
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/

# Build the service workspace
RUN npm run build:${SVC_NAME}

FROM runtime_base AS runtime_notification_service
ARG SVC_NAME=notification-service NOTIFY_SVC__PORT=3003
ENV NODE_ENV=production SVC_NAME=${SVC_NAME}
WORKDIR /app

# Copy build artifacts
COPY --from=build_notification_service /repo/services/${SVC_NAME}/dist ./services/${SVC_NAME}/dist/

# Copy package*.json files for npm ci
COPY --from=build_notification_service /repo/services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install runtime pkg depends
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

EXPOSE ${NOTIFY_SVC__PORT}

USER svc

# Run server
CMD ["sh", "-c", "node --loader @opentelemetry/instrumentation/hook.mjs /app/services/${SVC_NAME}/dist/index.js"]


# ===============================
# Web UI stage(s)
# ===============================
FROM build_base AS build_web_ui_deps
WORKDIR /repo

# Copy workspace package.json
COPY ./ui/ms-task-app-web/package.json ./ui/ms-task-app-web/

# Install dependencies
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund
RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund --save-dev --workspace=ui/ms-task-app-web lightningcss-linux-x64-musl @tailwindcss/oxide-linux-x64-musl

FROM build_web_ui_deps AS build_web_ui
ARG WEB_UI__CA_CERT_PATH
ARG WEB_UI__PRIVATE_KEY_PATH
ARG WEB_UI__CERT_PATH
ARG WEB_UI__KEY_CERT_COMBO_PATH
WORKDIR /repo

COPY ./ui/ms-task-app-web ./ui/ms-task-app-web/

ENV NEXT_TELEMETRY_DISABLED=1

# Build the service workspace
RUN --mount=type=secret,id=ca.cert.pem,target=${WEB_UI__CA_CERT_PATH} \
    --mount=type=secret,id=web-ui.key.pem,target=${WEB_UI__PRIVATE_KEY_PATH} \
    --mount=type=secret,id=web-ui.cert.pem,target=${WEB_UI__CERT_PATH} \
    --mount=type=secret,id=web-ui.pem,target=${WEB_UI__KEY_CERT_COMBO_PATH} \
    npm run build:web

FROM runtime_base AS runtime_web_ui
ARG WEB_UI_PORT=3000 OAUTH_SVC_PORT=3001 TASK_SVC_PORT=3002
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build_web_ui /repo/package*.json ./

COPY --from=build_web_ui /repo/ui/ms-task-app-web/package.json ./ui/ms-task-app-web/

RUN --mount=type=cache,target=/root/.npm,uid=0,gid=0 npm install --no-audit --no-fund

COPY --from=build_web_ui /repo/ui/ms-task-app-web/.next/standalone/node_modules* ./ui/ms-task-app-web/.next/standalone/node_modules
# Temporary fix for https://github.com/vercel/next.js/issues/86099
COPY --from=build_web_ui /repo/node_modules/pino/lib ./ui/ms-task-app-web/.next/standalone/node_modules/pino/lib
COPY --from=build_web_ui --chown=nextjs:nodejs /repo/ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web ./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web
COPY --from=build_web_ui --chown=nextjs:nodejs /repo/ui/ms-task-app-web/.next/static ./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web/.next/static
COPY --from=build_web_ui /repo/ui/ms-task-app-web/public* ./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web/public

# Run server as svc user
USER svc

EXPOSE ${WEB_UI_PORT}

ENV PORT=${WEB_UI_PORT}
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web/server.js"]
