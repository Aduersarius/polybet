import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma Client Singleton - v3 (force reload for new models)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Serverless-optimized connection pooling
// With Vercel serverless, many instances spawn - each needs a small pool
const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 3,  // VERY small pool for serverless (many instances × 3 = manageable)
    min: 0,  // No minimum - serverless should scale to zero
    idleTimeoutMillis: 5000,  // Aggressive cleanup (5s)
    connectionTimeoutMillis: 2000, // Fast timeout (2s)
    maxUses: 500, // Recycle frequently
    allowExitOnIdle: true, // Critical for serverless
});

const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
