'use workflow';

import { checkBalancesStep, sweepDepositStep } from './sweep-steps';

export async function processDepositSweep() {
    let offset = 0;
    const batchSize = 50;
    let hasMore = true;
    let totalSwept = 0;

    // Safety limit to prevent execution timeout on Vercel (max 10-60s depending on plan)
    // We process up to 10 batches (500 addresses) per run.
    // The cron should run frequently enough to cover active users.
    // Ideally, we'd persist the offset, but stateless scanning is robust for now.
    const MAX_BATCHES = 10;
    let batchesProcessed = 0;

    while (hasMore && batchesProcessed < MAX_BATCHES) {
        const result = await checkBalancesStep(offset, batchSize);
        hasMore = result.hasMore;
        offset += batchSize;
        batchesProcessed++;

        // Process found deposits immediately
        for (const deposit of result.foundDeposits) {
            await sweepDepositStep(deposit);
            totalSwept++;
        }
    }

    return {
        status: 'completed',
        totalSwept,
        scanned: offset
    };
}
