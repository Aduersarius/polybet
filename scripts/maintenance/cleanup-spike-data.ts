/**
 * One-time cleanup script to remove garbage odds history data points
 * 
 * These are typically caused by:
 * 1. Wide bid/ask spreads creating ~50% mid-prices
 * 2. One-sided orderbooks
 * 3. Stale data from thin markets
 * 
 * Usage:
 *   npx tsx scripts/cleanup-spike-data.ts --dry-run  # Preview what would be deleted
 *   npx tsx scripts/cleanup-spike-data.ts            # Actually delete the bad data
 */

import { prisma } from '../../lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');


/**
 * Maximum allowed price change in a single data point.
 * If a data point jumps more than this from its neighbors, it's considered suspicious.
 */
const MAX_SPIKE_THRESHOLD = 0.25; // 25% change is suspicious

async function main() {
    console.log(`🔍 Cleanup Spike Data Script`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : '⚠️  LIVE - will delete data'}`);
    console.log('');

    // Get all events with odds history
    const events = await prisma.event.findMany({
        where: { source: 'POLYMARKET' },
        select: { id: true, title: true },
    });

    console.log(`Found ${events.length} Polymarket events to analyze\n`);

    let totalDeleted = 0;
    let totalSuspicious = 0;

    for (const event of events) {
        // Get all odds history for this event, ordered by time
        const history = await prisma.oddsHistory.findMany({
            where: { eventId: event.id },
            orderBy: { timestamp: 'asc' },
            select: { id: true, outcomeId: true, probability: true, timestamp: true },
        });

        if (history.length < 3) continue;

        // Group by outcome to analyze each series independently
        const byOutcome = new Map<string, typeof history>();
        for (const h of history) {
            const existing = byOutcome.get(h.outcomeId) || [];
            existing.push(h);
            byOutcome.set(h.outcomeId, existing);
        }

        const toDelete: string[] = [];

        for (const [outcomeId, points] of byOutcome.entries()) {
            if (points.length < 3) continue;

            // Find spikes: points where both neighbors differ significantly
            for (let i = 1; i < points.length - 1; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const next = points[i + 1];

                const diffFromPrev = Math.abs(curr.probability - prev.probability);
                const diffFromNext = Math.abs(curr.probability - next.probability);
                const prevToNextDiff = Math.abs(next.probability - prev.probability);

                // If current point is a spike (big jump from prev AND next, but prev/next are close)
                if (
                    diffFromPrev > MAX_SPIKE_THRESHOLD &&
                    diffFromNext > MAX_SPIKE_THRESHOLD &&
                    prevToNextDiff < MAX_SPIKE_THRESHOLD
                ) {
                    toDelete.push(curr.id);
                    totalSuspicious++;

                    console.log(`  📊 ${event.title}`);
                    console.log(`     Outcome: ${outcomeId}`);
                    console.log(`     Spike: ${(prev.probability * 100).toFixed(1)}% → ${(curr.probability * 100).toFixed(1)}% → ${(next.probability * 100).toFixed(1)}%`);
                    console.log(`     Time: ${curr.timestamp.toISOString()}`);
                    console.log('');
                }
            }

            // Also check the last point if it's a massive jump from the second-to-last
            const last = points[points.length - 1];
            const secondLast = points[points.length - 2];
            if (points.length >= 2) {
                const diff = Math.abs(last.probability - secondLast.probability);
                // Only flag if it's a RECENT spike (within last day) to handle live price issues
                const isRecent = Date.now() - last.timestamp.getTime() < 24 * 60 * 60 * 1000;

                if (diff > MAX_SPIKE_THRESHOLD && isRecent) {
                    toDelete.push(last.id);
                    totalSuspicious++;

                    console.log(`  📊 ${event.title}`);
                    console.log(`     Outcome: ${outcomeId}`);
                    console.log(`     End Spike: ...${(secondLast.probability * 100).toFixed(1)}% → ${(last.probability * 100).toFixed(1)}%`);
                    console.log(`     Time: ${last.timestamp.toISOString()}`);
                    console.log('');
                }
            }
        }

        if (toDelete.length > 0 && !DRY_RUN) {
            await prisma.oddsHistory.deleteMany({
                where: { id: { in: toDelete } },
            });
            totalDeleted += toDelete.length;
        }
    }

    console.log('=====================================');
    console.log(`Found ${totalSuspicious} suspicious spike data points`);
    if (DRY_RUN) {
        console.log(`Run without --dry-run to delete them`);
    } else {
        console.log(`Deleted ${totalDeleted} data points`);
    }

    process.exit(0);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
