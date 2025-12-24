FROM node:24-alpine AS base

# Install sys deps
RUN apk add --no-cache libc6-compat

WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy common package source code
COPY ./packages/ms-task-app-common ./packages/ms-task-app-common/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-common/

# Copy DTO package*.json files
COPY ./packages/ms-task-app-dto/package.json ./packages/ms-task-app-dto/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-dto/

# Copy entities package*.json files
COPY ./packages/ms-task-app-entities/package.json ./packages/ms-task-app-entities/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-entities/

# Copy service-util package*.json files
COPY ./packages/ms-task-app-service-util/package.json ./packages/ms-task-app-service-util/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-service-util/

# Install NPM deps
RUN npm install --no-audit --no-fund


# ====================================================================
# Common builder stage - Builds common set of shared packages
# ====================================================================
FROM base AS build_base
WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy root TypeScript config
COPY ./tsconfig.json ./

# Copy common package source code
COPY ./packages/ms-task-app-common ./packages/ms-task-app-common/

# Copy DTO package source code
COPY ./packages/ms-task-app-dto ./packages/ms-task-app-dto/

# Copy entities package source code
COPY ./packages/ms-task-app-entities ./packages/ms-task-app-entities/

# Copy service-util package source code
COPY ./packages/ms-task-app-service-util ./packages/ms-task-app-service-util/

# Build the common package
RUN npm run build --workspace=packages/ms-task-app-common

# Build the DTO package 
RUN npm run build --workspace=packages/ms-task-app-dto

# Build the entities package 
RUN npm run build --workspace=packages/ms-task-app-entities

# Build the service-util package 
RUN npm run build --workspace=packages/ms-task-app-service-util


# ======================================================================
# Common Runtime Stage - Provides common set of shared package builds
# ======================================================================
FROM node:24-alpine AS runtime_base
WORKDIR /app
# Copy build artifacts
COPY --from=build_base /repo/packages/ms-task-app-common ./packages/ms-task-app-common
COPY --from=build_base /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_base /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_base /repo/packages/ms-task-app-service-util ./packages/ms-task-app-service-util

COPY --from=build_base /repo/package*.json ./


# ===============================
# User Service stage(s)
# ===============================
FROM build_base AS build_user_service
ARG SVC_NAME=user-service
WORKDIR /repo

# Copy service source code
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/${SVC_NAME}

FROM runtime_base AS runtime_user_service
ARG SVC_NAME=user-service USER_SVC_PORT=3001
ENV NODE_ENV=production SVC_NAME=${SVC_NAME}
WORKDIR /app

# Copy build artifacts
COPY --from=build_user_service /repo/services/${SVC_NAME}/dist ./services/${SVC_NAME}/dist/

# Copy package*.json files for npm ci
COPY --from=build_user_service /repo/services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

EXPOSE ${USER_SVC_PORT}

# Run server
CMD ["sh", "-c", "node /app/services/${SVC_NAME}/dist/index.js"]


# ===============================
# Task Service stage(s)
# ===============================
FROM build_base AS build_task_service
ARG SVC_NAME=task-service

WORKDIR /repo

# Copy service source code
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/${SVC_NAME}

FROM runtime_base AS runtime_task_service
ARG SVC_NAME=task-service TASK_SVC_PORT=3002
ENV NODE_ENV=production SVC_NAME=${SVC_NAME}
WORKDIR /app

# Copy build artifacts
COPY --from=build_task_service /repo/services/${SVC_NAME}/dist ./services/${SVC_NAME}/dist/

# Copy package*.json files for npm ci
COPY --from=build_task_service /repo/services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

EXPOSE ${TASK_SVC_PORT}

# Run server
CMD ["sh", "-c", "node /app/services/${SVC_NAME}/dist/index.js"]


# ===============================
# Notification Service stage(s)
# ===============================
FROM build_base AS build_notification_service
ARG SVC_NAME=notification-service
WORKDIR /repo

# Copy service source code
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/${SVC_NAME}

FROM runtime_base AS runtime_notification_service
ARG SVC_NAME=notification-service
ENV NODE_ENV=production SVC_NAME=${SVC_NAME}
WORKDIR /app

# Copy build artifacts
COPY --from=build_notification_service /repo/services/${SVC_NAME}/dist ./services/${SVC_NAME}/dist/

# Copy package*.json files for npm ci
COPY --from=build_notification_service /repo/services/${SVC_NAME}/package.json ./services/${SVC_NAME}/

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

# Run server
CMD ["sh", "-c", "node /app/services/${SVC_NAME}/dist/index.js"]


# ===============================
# Web UI stage(s)
# ===============================
FROM build_base AS build_web_ui
WORKDIR /repo

COPY ./ui/ms-task-app-web ./ui/ms-task-app-web/

# Install dependencies
RUN npm install --no-audit --no-fund
RUN npm install --workspace=ui/ms-task-app-web lightningcss-linux-x64-musl @tailwindcss/oxide-linux-x64-musl --save-dev

ENV NEXT_TELEMETRY_DISABLED=1

# Build the service workspace
RUN npm run build --workspace=ui/ms-task-app-web

FROM runtime_base AS runtime_web_ui
ARG WEB_UI_PORT=3000 USER_SVC_PORT=3001 TASK_SVC_PORT=3002
ENV NODE_ENV=production
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy pkg deps
#COPY --from=build_web_ui /repo/node_modules ./node_modules

COPY --from=build_web_ui /repo/package*.json ./

COPY --from=build_web_ui /repo/ui/ms-task-app-web/package.json ./ui/ms-task-app-web/

RUN npm ci --no-audit --no-fund

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=build_web_ui --chown=nextjs:nodejs /repo/ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web ./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web
COPY --from=build_web_ui --chown=nextjs:nodejs /repo/ui/ms-task-app-web/.next/static ./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web/.next/static
COPY --from=build_web_ui /repo/ui/ms-task-app-web/public* ./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web/public

# Run server as nexjs user
USER nextjs

EXPOSE ${WEB_UI_PORT}

ENV PORT=${WEB_UI_PORT}
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "./ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web/server.js"]
