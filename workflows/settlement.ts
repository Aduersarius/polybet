'use workflow';

import { fetchHedgePositionsStep, settleBatchStep } from './settlement-steps';

interface SettlementEvent {
    eventId: string;
    winningOutcome: string;
}

export async function processSettlement(event: SettlementEvent) {
    const { eventId, winningOutcome } = event;
    let cursor: string | null = null;
    let totalSettled = 0;
    let totalPnl = 0;

    let hasMore = true;
    while (hasMore) {
        // Fetch batch
        const { ids, nextCursor } = await fetchHedgePositionsStep(eventId, cursor);

        // Process batch
        if (ids.length > 0) {
            const result = await settleBatchStep(ids, winningOutcome);
            totalSettled += result.settled;
            totalPnl += result.totalPnl;
        }

        // Loop logic
        if (nextCursor) {
            cursor = nextCursor;
        } else {
            hasMore = false;
        }
    }

    return {
        status: 'completed',
        settled: totalSettled,
        totalPnl
    };
}
