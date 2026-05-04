# ── Stage 1: Build frontend ──────────────────────────────────
FROM oven/bun:1 AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run generate

# ── Stage 2: Build backend native modules ────────────────────
FROM node:20-slim AS backend-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install bun for package management
RUN npm i -g bun

WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./

# Production deps only (native modules compiled here)
RUN bun install --frozen-lockfile --production

# ── Stage 3: Production image (lean) ────────────────────────
FROM node:20-slim

# ffmpeg (runtime) + tsx (runs TS directly)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g tsx

WORKDIR /app

# Pre-built node_modules (production only, native modules ready)
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/

# Backend source
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Frontend static output
COPY --from=frontend-build /app/frontend/.output/public ./frontend/dist

# Skills
COPY skills/ ./skills/

# Config
COPY configs/config.example.yaml ./configs/config.yaml

RUN mkdir -p data/static

ENV NODE_ENV=production
ENV PORT=5679

EXPOSE 5679
VOLUME ["/app/data"]

CMD ["tsx", "backend/src/index.ts"]
