# ===============================
# Common builder stage
# ===============================
FROM node:24-alpine AS build_base

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

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the TDO package 
RUN npm run build --workspace=packages/ms-task-app-dto

# Build the entities package 
RUN npm run build --workspace=packages/ms-task-app-entities

# Build the shared package 
RUN npm run build --workspace=packages/ms-task-app-shared

# ===============================
# User Service stages
# ===============================
FROM build_base AS build_user_service
WORKDIR /repo

# Copy service source code and root package-lock.json
COPY ./services/user-service ./services/user-service/
COPY ./package-lock.json ./services/user-service/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/user-service

FROM node:24-alpine AS runtime_user_service
ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts
COPY --from=build_user_service /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_user_service /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_user_service /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared
COPY --from=build_user_service /repo/services/user-service/dist ./dist/

# Copy package*.json files for npm ci
COPY --from=build_user_service /repo/services/user-service/package.json ./
COPY --from=build_user_service /repo/package-lock.json ./

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

EXPOSE 3001

# Default command — update if your entry point is different
CMD ["node", "dist/index.js"]


# ===============================
# Task Service stage
# ===============================
FROM build_base AS build_task_service
WORKDIR /repo

# Copy service source code and root package-lock.json
COPY ./services/task-service ./services/task-service/
COPY ./package-lock.json ./services/task-service/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/task-service

FROM node:24-alpine AS runtime_task_service
ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts
COPY --from=build_task_service /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_task_service /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_task_service /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared
COPY --from=build_task_service /repo/services/task-service/dist ./dist/

# Copy package*.json files for npm ci
COPY --from=build_task_service /repo/services/task-service/package.json ./
COPY --from=build_task_service /repo/package-lock.json ./

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

EXPOSE 3002

# Default command — update if your entry point is different
CMD ["node", "dist/index.js"]

# ===============================
# Notification Service stage
# ===============================
FROM build_base AS build_notification_service
WORKDIR /repo

# Copy service source code and root package-lock.json
COPY ./services/notification-service ./services/notification-service/
COPY ./package-lock.json ./services/notification-service/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the service workspace
RUN npm run build --workspace=services/notification-service

FROM node:24-alpine AS runtime_notification_service
ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts
COPY --from=build_notification_service /repo/packages/ms-task-app-dto ./packages/ms-task-app-dto
COPY --from=build_notification_service /repo/packages/ms-task-app-entities ./packages/ms-task-app-entities
COPY --from=build_notification_service /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared
COPY --from=build_notification_service /repo/services/notification-service/dist ./dist/

# Copy package*.json files for npm ci
COPY --from=build_notification_service /repo/services/notification-service/package.json ./
COPY --from=build_notification_service /repo/package-lock.json ./

# Install runtime pkg depends
RUN npm ci --no-audit --no-fund

# Default command — update if your entry point is different
CMD ["node", "dist/index.js"]
