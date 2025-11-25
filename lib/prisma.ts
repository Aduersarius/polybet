import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma Client Singleton - v3 (force reload for new models)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Aggressive connection pooling for high concurrency
const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 100, // Maximum pool size (increased from default 10)
    min: 10, // Minimum pool size 
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 10000, // Wait 10s for connection
    maxUses: 7500, // Recycle connections after 7500 uses
});

const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
