# ============================================================
# PixelPrint — FILE_UPLOADER / backend
# Node.js + Express API server
# ============================================================

# ── Stage 1: base image ──────────────────────────────────────
# Use the Long-Term-Support version of Node on a slim Debian image.
# "slim" removes docs and man-pages to keep the image small (~180 MB vs ~900 MB).
FROM node:20-slim AS base

# ── Stage 2: dependencies ────────────────────────────────────
FROM base AS deps

# Set the working directory inside the container.
# All subsequent commands run from here.
WORKDIR /app

# Copy ONLY the manifest files first.
# Docker caches layers, so node_modules is only re-installed
# when package.json / package-lock.json actually change.
COPY package.json package-lock.json ./

# Install production dependencies only (no devDependencies like nodemon).
# --omit=dev keeps the image lean.
RUN npm ci --omit=dev

# ── Stage 3: final image ─────────────────────────────────────
FROM base AS runner

WORKDIR /app

# Copy installed node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the application source code
COPY src/ ./src/

# Copy the package.json (needed so node knows the entry point)
COPY package.json ./

# Expose the port this service listens on.
# ⚠️  To change the port, update the PORT env var in your .env file
#     AND the ports mapping in docker-compose.yml.
EXPOSE 5000

# Health-check: Docker will ping /health every 30 s.
# Mark the container "unhealthy" after 3 consecutive failures.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

# Start the server using npm start (runs: node src/server.js)
CMD ["npm", "start"]
