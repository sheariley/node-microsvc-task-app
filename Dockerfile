FROM node:24-alpine AS base

# Install sys deps
RUN apk add --no-cache libc6-compat

WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy DTO package source code
COPY ./packages/ms-task-app-dto/package.json ./packages/ms-task-app-dto/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-dto/

# Copy entities package source code
COPY ./packages/ms-task-app-entities/package.json ./packages/ms-task-app-entities/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-entities/

# Copy shared package source code
COPY ./packages/ms-task-app-shared/package.json ./packages/ms-task-app-shared/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-shared/

# Install NPM deps
RUN npm install --no-audit --no-fund


# ===============================
# Common builder stage
# ===============================
FROM base AS build_base
WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy root TypeScript config
COPY ./tsconfig.json ./

# Copy DTO package source code
COPY ./packages/ms-task-app-dto ./packages/ms-task-app-dto/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-dto/

# Copy entities package source code
COPY ./packages/ms-task-app-entities ./packages/ms-task-app-entities/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-entities/

# Copy shared package source code
COPY ./packages/ms-task-app-shared ./packages/ms-task-app-shared/
# Copy root package-lock.json to package source dir
COPY /package-lock.json ./packages/ms-task-app-shared/

# Build the TDO package 
RUN npm run build --workspace=packages/ms-task-app-dto

# Build the entities package 
RUN npm run build --workspace=packages/ms-task-app-entities

# Build the shared package 
RUN npm run build --workspace=packages/ms-task-app-shared

# ===============================
# User Service stage(s)
# ===============================
FROM build_base AS build_user_service
ARG SVC_NAME=user-service
WORKDIR /repo

# Copy service source code and root package-lock.json
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/
COPY ./package-lock.json ./services/${SVC_NAME}/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/${SVC_NAME}

FROM node:24-alpine AS runtime_user_service
ARG SVC_NAME=user-service USER_SVC_PORT=3001
ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts
COPY --from=build_base /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_base /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_base /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared
COPY --from=build_user_service /repo/services/${SVC_NAME}/dist ./dist/

# Copy package*.json files for npm ci
COPY --from=build_user_service /repo/services/${SVC_NAME}/package.json ./
COPY --from=build_user_service /repo/package-lock.json ./

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

EXPOSE ${USER_SVC_PORT}

# Run server
CMD ["node", "dist/index.js"]


# ===============================
# Task Service stage(s)
# ===============================
FROM build_base AS build_task_service
ARG SVC_NAME=task-service

WORKDIR /repo

# Copy service source code and root package-lock.json
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/
COPY ./package-lock.json ./services/${SVC_NAME}/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/${SVC_NAME}

FROM node:24-alpine AS runtime_task_service
ARG SVC_NAME=task-service TASK_SVC_PORT=3002
ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts
COPY --from=build_base /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_base /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_base /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared
COPY --from=build_task_service /repo/services/${SVC_NAME}/dist ./dist/

# Copy package*.json files for npm ci
COPY --from=build_task_service /repo/services/${SVC_NAME}/package.json ./
COPY --from=build_task_service /repo/package-lock.json ./

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

EXPOSE ${TASK_SVC_PORT}

# Run server
CMD ["node", "dist/index.js"]


# ===============================
# Notification Service stage(s)
# ===============================
FROM build_base AS build_notification_service
ARG SVC_NAME=notification-service
WORKDIR /repo

# Copy service source code and root package-lock.json
COPY ./services/${SVC_NAME} ./services/${SVC_NAME}/
COPY ./package-lock.json ./services/${SVC_NAME}/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/${SVC_NAME}

FROM node:24-alpine AS runtime_notification_service
ARG SVC_NAME=notification-service
ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts
COPY --from=build_base /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_base /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_base /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared
COPY --from=build_notification_service /repo/services/${SVC_NAME}/dist ./dist/

# Copy package*.json files for npm ci
COPY --from=build_notification_service /repo/services/${SVC_NAME}/package.json ./
COPY --from=build_notification_service /repo/package-lock.json ./

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

# Run server
CMD ["node", "dist/index.js"]


# ===============================
# Web UI stage(s)
# ===============================
FROM build_base AS build_web_ui
WORKDIR /repo

COPY ./ui/ms-task-app-web ./ui/ms-task-app-web/
# COPY ./package-lock.json ./ui/ms-task-app-web/

# Install dependencies
RUN npm install --no-audit --no-fund
RUN npm install --workspace=ui/ms-task-app-web lightningcss-linux-x64-musl @tailwindcss/oxide-linux-x64-musl --save-dev

ENV NEXT_TELEMETRY_DISABLED=1

# Build the service workspace
RUN npm run build --workspace=ui/ms-task-app-web

FROM node:24-alpine AS runtime_web_ui
ARG WEB_UI_PORT=3000 USER_SVC_PORT=3001 TASK_SVC_PORT=3002
ENV NODE_ENV=production
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy build artifacts
COPY --from=build_web_ui /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_web_ui /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_web_ui /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared

# Copy pkg deps
COPY --from=build_web_ui /repo/node_modules ./node_modules
COPY --from=build_web_ui /repo/package.json ./

COPY --from=build_web_ui /repo/ui/ms-task-app-web/public* ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=build_web_ui --chown=nextjs:nodejs /repo/ui/ms-task-app-web/.next/standalone/ui/ms-task-app-web ./
COPY --from=build_web_ui --chown=nextjs:nodejs /repo/ui/ms-task-app-web/.next/static ./.next/static


# Run server as nexjs user
USER nextjs

EXPOSE ${WEB_UI_PORT}

ENV PORT=${WEB_UI_PORT}
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "server.js"]
