import { PrismaClient } from '@prisma/client';

// Prisma Client Singleton - v3 (force reload for new models)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const basePrisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

export const prisma = basePrisma;
