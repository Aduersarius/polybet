import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma Client Singleton - v3 (force reload for new models)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Optimized connection pooling for high concurrency
const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 20, // Further reduced to prevent connection exhaustion under load
    min: 2,  // Minimal minimum connections
    idleTimeoutMillis: 10000, // Close idle clients after 10s (more aggressive)
    connectionTimeoutMillis: 3000, // Faster timeout (3s)
    maxUses: 1000, // Recycle connections much sooner
    allowExitOnIdle: true, // Allow pool to close when idle
});

const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
