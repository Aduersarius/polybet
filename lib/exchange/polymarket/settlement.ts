
import { prisma } from '@/lib/prisma';

/**
 * Settles all hedge positions for a resolved event
 */
export async function settleEventHedges(
    eventId: string,
    winningOutcome: string
): Promise<{ settled: number; totalPnl: number }> {
    const positions = await prisma.hedgePosition.findMany({
        where: {
            userOrder: { eventId },
            status: 'hedged'
        },
        include: { userOrder: true }
    });

    let settled = 0;
    let totalPnl = 0;

    for (const position of positions) {
        const result = await settleHedgePosition(position.id, winningOutcome);
        if (result.settled) {
            settled++;
            totalPnl += result.pnl;
        }
    }

    return { settled, totalPnl };
}

/**
 * Settles a single hedge position
 */
export async function settleHedgePosition(
    hedgePositionId: string,
    winningOutcome: string
): Promise<{ settled: boolean; pnl: number; error?: string }> {
    const position = await prisma.hedgePosition.findUnique({
        where: { id: hedgePositionId },
        include: { userOrder: true }
    });

    if (!position) {
        return { settled: false, pnl: 0, error: 'Position not found' };
    }

    if (position.status === 'closed') {
        return { settled: true, pnl: Number(position.netProfit) || 0 };
    }

    // Calculate P/L
    const userOption = position.userOrder?.option || 'YES';
    const won = userOption === winningOutcome;
    const amount = Number(position.amount);
    const spreadCaptured = Number(position.spreadCaptured) || 0;
    const fees = Number(position.polymarketFees) || 0;

    // For a hedged position, P/L = spread - fees (wins/losses on exchange/internal cancel each other)
    const pnl = spreadCaptured - fees;

    await prisma.hedgePosition.update({
        where: { id: hedgePositionId },
        data: {
            status: 'closed',
            netProfit: pnl,
            settlementPrice: won ? 1 : 0,
            closedAt: new Date(),
        }
    });

    return { settled: true, pnl };
}
