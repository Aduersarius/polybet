'use step';

import { prisma } from '@/lib/prisma';

import { hedgeManager } from '@/lib/hedge-manager';

export async function fetchHedgePositionsStep(eventId: string, cursor?: string | null) {
    const take = 50;
    const positions = await prisma.hedgePosition.findMany({
        where: {
            userOrder: { eventId },
            status: { in: ['pending', 'hedged', 'partial'] } // Updated to match HedgeManager.getEventHedgePositions
        },
        select: { id: true },
        take: take + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' }
    });

    let nextCursor: string | null = null;
    if (positions.length > take) {
        const nextItem = positions.pop();
        nextCursor = nextItem?.id || null;
    }

    return { ids: positions.map((p: { id: string }) => p.id), nextCursor };
}

export async function settleBatchStep(ids: string[], winningOutcome: string) {
    let settled = 0;
    let totalPnl = 0;

    await Promise.all(ids.map(async (id) => {
        try {
            const result = await hedgeManager.settleHedgePosition(id, winningOutcome);
            if (result.settled) {
                settled++;
                totalPnl += result.pnl;
            }
        } catch (e) {
            console.error(`[Settlement] Failed to settle position ${id}:`, e);
        }
    }));

    return { settled, totalPnl };
}
