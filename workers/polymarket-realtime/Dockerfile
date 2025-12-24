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

# Generate Prisma client (dummy URL for build, real URL comes at runtime)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Copy worker source files
COPY workers/polymarket-realtime/tsconfig.json ./
COPY workers/polymarket-realtime/worker.ts ./
COPY workers/polymarket-realtime/lib/ ./lib/

# Build TypeScript
RUN npm run build

# Clear dummy env for runtime
ENV DATABASE_URL=""

# Run the worker
CMD ["node", "dist/worker.js"]
