# Multi-stage Dockerfile for the task-service (monorepo-aware)
# Stage 1: build
FROM node:24-alpine AS builder

WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy root TypeScript config
COPY ./tsconfig.json ./

# Copy shared package source code
COPY ./packages/ms-task-app-shared ./packages/ms-task-app-shared/

# Copy service source code
COPY ./services/task-service ./services/task-service/

# Copy root package-lock.json to service source dir
COPY /package-lock.json ./services/task-service/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build the shared package 
RUN npm run build --workspace=packages/ms-task-app-shared

# Build the service workspace
RUN npm run build --workspace=services/task-service

# Stage 2: runtime / artifact output
FROM node:24-alpine AS runtime

WORKDIR /app

# Copy built artifact from the builder stage into /app
# Adjust `dist` path below if your build outputs to a different folder
COPY --from=builder /repo/services/task-service/dist ./dist

# Copy the package.json for the runtime dependency installation
COPY --from=builder /repo/services/task-service/package.json ./package.json
COPY --from=builder /repo/services/task-service/package-lock.json ./package-lock.json

# Ensure the built workspace package is present under `packages/` so that
# `npm ci` can create the expected linked dependency (the lockfile uses
# a local path for `ms-task-app-shared`). Copy the compiled output and
# package metadata from the builder stage.
COPY --from=builder /repo/packages/ms-task-app-shared ./packages/ms-task-app-shared/

ENV NODE_ENV=production

# Install only production dependencies in the final image
RUN npm ci --no-audit --no-fund

EXPOSE 3002

# Default command — update if your entry point is different
CMD ["node", "dist/index.js"]
