FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat

# 1. Install dependencies (Root + Worker)
# We copy the worker package.json to the root for install, simulating a focused install
COPY workers/polymarket-realtime/package*.json ./
RUN npm install --include=dev

# 2. Copy Shared Libraries (CRITICAL for Redis/Env fixes)
# This ensures ../../lib/redis resolves to the updated code
COPY lib/ ./lib/
COPY prisma/ ./prisma/
COPY .env* ./

# 3. Copy Worker Source Code
# Preserve structure so relative imports (../../lib) work
COPY workers/polymarket-realtime/ ./workers/polymarket-realtime/

# 4. Generate Prisma Client
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

#5. Runtime
ENV NODE_ENV=production

# Run as non-root
USER node

# Run worker with tsx (no need to compile)
CMD ["npx", "tsx", "workers/polymarket-realtime/worker.ts"]
