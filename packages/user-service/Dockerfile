# Multi-stage Dockerfile for the user-service (monorepo-aware)
# Stage 1: build
FROM node:24-alpine AS builder

# Install build tools that may be needed by some native modules
RUN apk add --no-cache make g++ python3 git

WORKDIR /repo

# Copy root package files and the package's package.json first to leverage Docker layer caching
COPY package*.json ./
COPY packages/user-service/package*.json ./packages/user-service/

# Copy the rest of the repo (source, tsconfig, etc.)
COPY . .

# Install dependencies (handles monorepo workspaces defined in the root `package.json`)
RUN npm ci --no-audit --no-fund

# Build only the user-service workspace (runs the package's `build` script which should run tsc)
RUN npm run build --workspace=packages/user-service

# Stage 2: runtime / artifact output
FROM node:24-alpine AS runtime

WORKDIR /app

# Copy built artifact from the builder stage into /app
# Adjust `dist` path below if your build outputs to a different folder
COPY --from=builder /repo/packages/user-service/dist ./dist

# Copy the package.json for the runtime dependency installation
COPY --from=builder /repo/packages/user-service/package.json ./package.json
COPY --from=builder /repo/packages/user-service/package-lock.json ./package-lock.json

ENV NODE_ENV=production

# Install only production dependencies in the final image
RUN npm ci --no-audit --no-fund

EXPOSE 3001

# Default command — update if your entry point is different
CMD ["node", "dist/index.js"]
