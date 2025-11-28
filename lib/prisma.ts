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
    max: 10,  // Increased for stability
    min: 0,
    idleTimeoutMillis: 30000,  // 30s
    connectionTimeoutMillis: 10000, // 10s
    maxUses: 5000,
    allowExitOnIdle: true,
});

const adapter = new PrismaPg(pool);

new PrismaClient({ adapter });

const basePrisma =
    globalForPrisma.prisma ||
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

export const prisma = basePrisma;
