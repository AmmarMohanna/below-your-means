# Build stage - includes build dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - MINIMAL AND HARDENED
FROM node:20-alpine AS runner

WORKDIR /app

# Security: Create non-root user FIRST
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Security: Install ONLY the minimal runtime for better-sqlite3
# Use multi-stage to get the compiled native module, no build tools needed
RUN apk add --no-cache libstdc++

# Security: Remove ALL potentially dangerous tools
RUN rm -rf /usr/bin/wget /usr/bin/curl /usr/bin/nc /usr/bin/telnet \
    /usr/bin/ftp /usr/bin/ssh /usr/bin/scp /usr/bin/sftp 2>/dev/null || true

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy ONLY necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the compiled better-sqlite3 native module
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Create data directory
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Create healthcheck script (uses Node.js only, no external tools)
RUN echo '#!/bin/sh' > /app/healthcheck.sh && \
    echo 'node -e "fetch(\"http://127.0.0.1:3000/api/auth/check\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' >> /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh && \
    chown nextjs:nodejs /app/healthcheck.sh

# Set ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH="/app/data/belowyourmeans.db"

CMD ["node", "server.js"]
