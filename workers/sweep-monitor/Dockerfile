FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma on Alpine (openssl, libc compatibility)
RUN apk add --no-cache openssl libc6-compat

# Copy worker package files (build context is project root)
# We copy the root package.json too because it contains the prisma dependencies versions
COPY package.json ./package-root.json
COPY workers/sweep-monitor/package*.json ./

# Install dependencies
# We merge dependencies to ensure we have everything needed for prisma generate
RUN npm install
RUN npm install prisma @prisma/client typescript ts-node @types/node

# Copy Prisma schema from project root
COPY prisma/ ./prisma/

# Generate Prisma client
# Use a dummy URL that is valid structure but local
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Copy worker source files
COPY workers/sweep-monitor/tsconfig.json ./
COPY workers/sweep-monitor/worker.ts ./

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
