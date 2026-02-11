# Servanda Office — Export Worker
# Includes LibreOffice for ODT conversion (ADR-004)

FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/export-worker/package.json apps/export-worker/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=@servanda/export-worker --workspace=@servanda/shared

COPY packages/shared/ packages/shared/
COPY apps/export-worker/ apps/export-worker/

RUN npm run build -w packages/shared
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build -w apps/export-worker

# --- Production ---
FROM node:20-slim AS runtime
WORKDIR /app

# Install LibreOffice headless for ODT conversion + OpenSSL for Prisma
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      libreoffice-writer \
      openssl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/export-worker/dist ./apps/export-worker/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

ENV NODE_ENV=production

CMD ["node", "apps/export-worker/dist/main.js"]
