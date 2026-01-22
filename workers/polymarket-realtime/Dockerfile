FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat

# 1. Install dependencies (Root + Worker)
COPY workers/polymarket-realtime/package*.json ./
RUN npm install --include=dev

# 2. Copy Shared Libraries (CRITICAL for Redis/Env fixes)
COPY lib/ ./lib/
COPY prisma/ ./prisma/
COPY .env* ./

# 3. Copy Database CA Certificate (CRITICAL for Prisma)
COPY certs/db-ca.crt ./certs/db-ca.crt

# 4. Copy Worker Source Code
COPY workers/polymarket-realtime/ ./workers/polymarket-realtime/

# 5. Generate Prisma Client
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# 6. Runtime
ENV NODE_ENV=production

# Run as non-root
USER node

# Run worker with tsx (no compilation needed)
CMD ["npx", "tsx", "workers/polymarket-realtime/worker.ts"]
