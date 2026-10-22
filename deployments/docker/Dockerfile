# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# Copy workspace configurations
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json vitest.config.ts ./
COPY packages/ ./packages/

# Install and build all workspace packages
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm build

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# Copy built artifacts and workspace files
COPY --from=builder /build/package.json /build/pnpm-workspace.yaml ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages ./packages

# Link global CLI binary
RUN pnpm --filter=talon link --global

# Prepare persistent data directory
RUN mkdir -p /app/data && chown -R node:node /app

USER node
ENV NODE_ENV=production
ENV TALON_DB_PATH=/app/data/opentalon.db

EXPOSE 3100

# Default command: launch local HTTP daemon
CMD ["talon", "serve", "--port", "3100", "--host", "0.0.0.0"]
