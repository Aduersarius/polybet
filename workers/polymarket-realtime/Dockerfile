FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma
RUN apk add --no-cache openssl

# Copy worker package files (build context is project root)
COPY workers/polymarket-realtime/package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema from project root
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy worker source files
COPY workers/polymarket-realtime/tsconfig.json ./
COPY workers/polymarket-realtime/worker.ts ./

# Build TypeScript
RUN npm run build

# Run the worker
CMD ["node", "dist/worker.js"]
