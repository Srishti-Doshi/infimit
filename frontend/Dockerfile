# syntax=docker/dockerfile:1.6
# ---------------------------------------------------------------
# Infimit frontend — multi-stage build
# ---------------------------------------------------------------
# Stage 1: build  — install deps, run vite build, emit dist/
# Stage 2: runner — nginx:alpine serves dist/ with SPA fallback
# ---------------------------------------------------------------

ARG NODE_VERSION=20-alpine

# ---- Stage 1: build ----
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Lockfile-driven install — reproducible across machines.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Source + config
COPY tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.ts postcss.config.cjs ./
COPY index.html ./
COPY src ./src
COPY public ./public

# Production build settings — MSW disabled in the bundle, real API URL baked in.
# Override at build time: `docker build --build-arg VITE_API_BASE_URL=https://api.infimit.com/v1 .`
ARG VITE_API_BASE_URL=http://localhost:4000/v1
ENV VITE_USE_MOCK=false
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ---- Stage 2: serve via nginx ----
FROM nginx:alpine AS runner

# Replace default nginx config with our SPA-friendly one
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets — nothing else from the build stage carries through.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5173/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
