import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    (process.env.NODE_ENV === 'production'
        ? new PrismaClient().$extends(withAccelerate())
        : new PrismaClient());

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
