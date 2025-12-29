/**
 * Market Resolution Logic for Worker
 * Extracted from hybrid-trading.ts for standalone use
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Decimal from 'decimal.js';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    max: 5,
});

const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
});

interface ResolveResult {
    winnersCount: number;
    totalPayout: number;
    totalFees: number;
}

interface Outcome {
    id: string;
    name: string;
    probability: number | null;
}

interface EventWithOutcomes {
    id: string;
    type: string;
    status: string;
    outcomes: Outcome[];
}

export async function resolveMarket(eventId: string, winningOutcomeId: string): Promise<ResolveResult> {
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true },
    }) as EventWithOutcomes | null;

    if (!event) {
        throw new Error(`Event ${eventId} not found`);
    }

    if (event.status === 'RESOLVED') {
        throw new Error(`Event ${eventId} already resolved`);
    }

    const isBinary = event.type === 'BINARY';

    // Determine winner
    const winningOutcome = isBinary
        ? winningOutcomeId.toUpperCase()
        : winningOutcomeId;

    // For multiple-type events, find the outcome
    if (!isBinary) {
        const outcome = event.outcomes.find((o: Outcome) => o.id === winningOutcomeId);
        if (!outcome) {
            throw new Error(`Outcome ${winningOutcomeId} not found for event ${eventId}`);
        }
    }

    // Process payouts in a transaction
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => {
        // Find all winning positions (balances)
        const winningBalances = await tx.balance.findMany({
            where: {
                eventId,
                tokenSymbol: { contains: isBinary ? `_${winningOutcome}` : `_${winningOutcomeId}` },
                amount: { gt: 0 },
            },
        });

        let totalPayout = 0;
        let winnersCount = 0;
        const platformFeeRate = 0.02; // 2% platform fee

        for (const balance of winningBalances) {
            const payout = Number(balance.amount);
            const fee = payout * platformFeeRate;
            const netPayout = payout - fee;

            // Credit user's TUSD balance
            await tx.balance.upsert({
                where: {
                    userId_tokenSymbol_eventId_outcomeId: {
                        userId: balance.userId,
                        tokenSymbol: 'TUSD',
                        eventId: '',
                        outcomeId: '',
                    },
                },
                update: {
                    amount: { increment: new Decimal(netPayout) as any },
                },
                create: {
                    userId: balance.userId,
                    tokenSymbol: 'TUSD',
                    amount: new Decimal(netPayout) as any,
                },
            });

            // Zero out the winning position
            await tx.balance.update({
                where: { id: balance.id },
                data: { amount: 0 },
            });

            totalPayout += netPayout;
            winnersCount++;
        }

        // Zero out all losing positions for this event
        await tx.balance.updateMany({
            where: {
                eventId,
                tokenSymbol: { not: { contains: isBinary ? `_${winningOutcome}` : `_${winningOutcomeId}` } },
            },
            data: { amount: 0 },
        });

        // Update event status
        await tx.event.update({
            where: { id: eventId },
            data: {
                status: 'RESOLVED',
                result: winningOutcomeId,
                resolvedAt: new Date(),
            },
        });

        const totalFees = totalPayout * platformFeeRate / (1 - platformFeeRate);

        return {
            winnersCount,
            totalPayout,
            totalFees,
        };
    }, {
        timeout: 30000,
    });
}
