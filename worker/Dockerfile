FROM node:22-alpine AS builder

RUN apk add --no-cache dumb-init

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

WORKDIR /app

COPY package.json package-lock.json ./

COPY worker/package.json ./worker/
COPY packages/shared/package.json ./packages/shared/

# TRADEOFF: backend/package.json is copied so npm installs backend's
# dependencies and hoists them alongside the worker's own deps. This is
# necessary because the worker imports backend TypeScript source directly via
# @backend/* path aliases (tsx resolves them at runtime without compilation),
# which makes it implicitly depend on every npm package backend/src uses.
#
# The clean production approach is to extract the shared surface
# (changelog pipeline, db schema, agent tools) into a proper workspace package
# (e.g. packages/backend-core) that both backend and worker declare as an
# explicit dependency. That way each workspace owns its own dep graph and
# backend's server-only packages (fastify, etc.) are never installed in the
# worker image.
COPY backend/package.json ./backend/

RUN npm ci

COPY packages/shared/ ./packages/shared/

COPY worker/src/ ./worker/src/
COPY worker/tsconfig.json ./worker/

# Copy backend source so tsx can resolve @backend/* path aliases at runtime.
# worker/tsconfig.json maps @backend/* → ../backend/src/*, which tsx handles
# natively — no compiled output needed, just the TypeScript sources.
COPY backend/src/ ./backend/src/

# Build the shared package so packages/shared/dist/ exists for any code that
# resolves @upgrade-advisor/shared via the node_modules workspace symlink.
RUN npm run build --workspace=packages/shared

RUN npm prune --omit=dev

FROM node:22-alpine AS release

RUN apk add --no-cache dumb-init

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy the compiled shared package directory.
# node_modules/@upgrade-advisor/shared is an npm workspace symlink pointing to
# ../../packages/shared. For Node to resolve that symlink at runtime, the actual
# packages/shared directory (with its compiled dist/) must exist on the filesystem.
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared ./packages/shared

COPY --from=builder --chown=nodejs:nodejs /app/worker/src ./worker/src
COPY --from=builder --chown=nodejs:nodejs /app/worker/tsconfig.json ./worker/tsconfig.json

COPY --from=builder --chown=nodejs:nodejs /app/backend/src ./backend/src

ENV NODE_ENV=production

ENV PATH="/app/node_modules/.bin:${PATH}"

USER nodejs

# WORKDIR must be /app/worker so that:
#   - tsx finds tsconfig.json in the cwd
#   - path aliases resolve relative to this directory
#     (@backend/* → ../backend/src/* = /app/backend/src/*)
WORKDIR /app/worker

ENTRYPOINT ["dumb-init", "--"]

CMD ["tsx", "src/index.ts"]
