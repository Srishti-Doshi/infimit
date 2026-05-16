# syntax=docker/dockerfile:1.6
# ---------------------------------------------------------------
# Infimit backend — multi-stage build
# ---------------------------------------------------------------
# Stage 1: deps  — install full deps (dev + prod) and compile TS
# Stage 2: prune — install prod-only deps to copy into the runner
# Stage 3: run   — non-root, slim runtime image
# ---------------------------------------------------------------

ARG NODE_VERSION=20-alpine

# ---- Stage 1: build ----
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Install all deps deterministically (npm ci needs lockfile).
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: production deps only ----
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- Stage 3: runner ----
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps"

# Create non-root user.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Healthcheck hits /healthz (liveness; cheap).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-4000}/healthz | grep -q '"ok"' || exit 1

USER app
EXPOSE 4000

CMD ["node", "dist/server.js"]
