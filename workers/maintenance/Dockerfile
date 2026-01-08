FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY workers/maintenance/package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY workers/maintenance/tsconfig.json ./
COPY workers/maintenance/worker.ts ./

# Build
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Run
CMD ["node", "dist/worker.js"]
