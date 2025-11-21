import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    (() => {
        const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
        if (!url) throw new Error('No database URL found');

        const pool = new pg.Pool({ connectionString: url });
        const adapter = new PrismaPg(pool);

        return new PrismaClient({
            adapter,
        });
    })();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
