# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - HARDENED
FROM node:20-alpine AS runner

WORKDIR /app

# Install ONLY runtime dependencies for better-sqlite3
# NO curl, wget, or other network tools
RUN apk add --no-cache python3 make g++ \
    && rm -rf /usr/bin/wget /usr/bin/curl 2>/dev/null || true

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Create healthcheck script
RUN echo '#!/bin/sh' > /app/healthcheck.sh && \
    echo 'node -e "fetch(\"http://127.0.0.1:3000/api/auth/check\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' >> /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh && \
    chown nextjs:nodejs /app/healthcheck.sh

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH="/app/data/belowyourmeans.db"

CMD ["node", "server.js"]
