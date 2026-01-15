FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma on Alpine (openssl, libc compatibility)
RUN apk add --no-cache openssl libc6-compat

# Copy worker package files (build context is project root)
COPY workers/polymarket-realtime/package*.json ./

# Install ALL dependencies (including devDependencies for prisma CLI and tsc)
RUN npm install --include=dev

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

# Prune devDependencies for smaller image
RUN npm prune --production

# Clear dummy env for runtime
ENV DATABASE_URL=""

# Run the worker
# Run as non-root user for security
USER node

CMD ["node", "dist/worker.js"]
