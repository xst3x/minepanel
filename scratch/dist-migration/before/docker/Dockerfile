# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build frontend (Vite)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend

COPY src/frontend/package*.json ./
RUN npm install --frozen-lockfile

COPY src/frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Java 21 (headless) so MinePanel can launch Minecraft servers,
# plus tini for proper PID-1 / signal handling / zombie reaping,
# plus curl for the Docker healthcheck
RUN apk add --no-cache \
    openjdk21-jre-headless \
    tini \
    curl \
    bash

WORKDIR /app

# Install backend dependencies (production only, rebuild native modules for Alpine)
COPY package*.json ./
RUN npm install --omit=dev && npm rebuild

# Copy backend source
COPY src/ ./src/
COPY minepanel_main.js ./

# Overwrite the auto-built public dir with our Vite build from Stage 1
COPY --from=frontend-builder /build/public ./src/public

# All persistent data lives under /data (mounted as Docker volume).
# The backend reads DATA_DIR env var to find its subdirectories:
#   /data/db       — SQLite database
#   /data/servers  — Minecraft server directories
#   /data/cache    — Downloaded JARs / version cache
#   /data/logs     — Application logs
#   /data/avatars  — User avatars
#   /data/certs    — TLS certificates (optional)
RUN mkdir -p /data/db /data/servers /data/cache/jars /data/logs /data/avatars /data/certs

# Panel web port (can be overridden via PORT env var)
EXPOSE 8081

# tini as PID 1 — required for correct Ctrl-C handling and zombie reaping
# when MinePanel forks Minecraft server child processes
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "minepanel_main.js"]
