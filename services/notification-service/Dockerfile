# Multi-stage Dockerfile for the notification-service (monorepo-aware)
# Stage 1: build
FROM node:24-alpine AS builder

# Install build tools that may be needed by some native modules
#RUN apk add --no-cache make g++ python3 git

WORKDIR /repo

# Copy root package*.json files
COPY /package*.json ./

# Copy root TypeScript config
COPY ./tsconfig.json ./

# Copy shared package source code
COPY ./packages/ms-task-app-shared ./packages/ms-task-app-shared/

# Copy service source code
COPY ./services/notification-service ./services/notification-service/

# Copy root package-lock.json to service source dir
COPY /package-lock.json ./services/notification-service/

# Install dependencies
RUN npm install --no-audit --no-fund

# Build only the notification-service workspace
RUN npm run build --workspace=services/notification-service

# Stage 2: runtime / artifact output
FROM node:24-alpine AS runtime

WORKDIR /app

# Copy built artifact from the builder stage into /app
# Adjust `dist` path below if your build outputs to a different folder
COPY --from=builder /repo/services/notification-service/dist ./dist

# Copy the package.json for the runtime dependency installation
COPY --from=builder /repo/services/notification-service/package.json ./package.json
COPY --from=builder /repo/services/notification-service/package-lock.json ./package-lock.json

ENV NODE_ENV=production

# Install only production dependencies in the final image
RUN npm ci --no-audit --no-fund

EXPOSE 3003

# Default command — update if your entry point is different
CMD ["node", "dist/index.js"]
