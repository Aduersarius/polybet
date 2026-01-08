#!/usr/bin/env npx ts-node
/**
 * Periodic OddsHistory Sync
 * 
 * Appends current prices to OddsHistory table for all active events.
 * Should run every 30 minutes via cron to maintain chart continuity.
 * 
 * Cron: */30 * * * * npx ts - node scripts / maintenance / sync - odds - history.ts
    */

import { prisma } from '../../lib/prisma';

const BUCKET_MS = 30 * 60 * 1000; // 30-minute buckets
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';

function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

async function fetchLivePrice(tokenId: string): Promise<number | undefined> {
    try {
        const url = `${POLYMARKET_CLOB_API_URL}/book?token_id=${encodeURIComponent(tokenId)}`;
        const resp = await fetch(url, { cache: 'no-store' });

        if (!resp.ok) return undefined;

        const data = await resp.json();
        const bids = data?.bids || [];
        const asks = data?.asks || [];

        if (bids.length === 0 && asks.length === 0) return undefined;

        const bestBid = bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : undefined;
        const bestAsk = asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : undefined;

        if (bestBid !== undefined && bestAsk !== undefined) {
            return (bestBid + bestAsk) / 2;
        }
        if (bestBid !== undefined) return bestBid;
        if (bestAsk !== undefined) return bestAsk;

        return undefined;
    } catch (err) {
        console.error(`[SyncOdds] Failed to fetch price for ${tokenId}:`, err);
        return undefined;
    }
}

async function syncOddsHistory(): Promise<void> {
    console.log('[SyncOdds] Starting periodic odds history sync...');
    const startTime = Date.now();

    // Get all active events with Polymarket mappings
    const mappings = await prisma.polymarketMarketMapping.findMany({
        where: {
            isActive: true,
            OR: [
                { yesTokenId: { not: null } },
                { noTokenId: { not: null } },
            ],
        },
        include: {
            event: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    type: true,
                    outcomes: {
                        select: {
                            id: true,
                            name: true,
                            polymarketOutcomeId: true,
                        },
                    },
                },
            },
        },
    });

    // Filter to active events only
    const activeMappings = mappings.filter(m => m.event?.status === 'ACTIVE');
    console.log(`[SyncOdds] Found ${activeMappings.length} active events to sync`);

    const bucketTs = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const oddsRows: any[] = [];
    let pricesFetched = 0;
    let errors = 0;

    for (const mapping of activeMappings) {
        const event = mapping.event;
        if (!event) continue;

        try {
            if (event.type === 'BINARY') {
                // For binary events, fetch YES token price
                if (mapping.yesTokenId) {
                    const price = await fetchLivePrice(mapping.yesTokenId);
                    if (price !== undefined) {
                        // Find YES outcome
                        const yesOutcome = event.outcomes?.find(o =>
                            o.name?.toUpperCase() === 'YES' ||
                            o.polymarketOutcomeId === mapping.yesTokenId
                        );

                        if (yesOutcome) {
                            oddsRows.push({
                                eventId: event.id,
                                outcomeId: yesOutcome.id,
                                polymarketTokenId: mapping.yesTokenId,
                                timestamp: new Date(bucketTs),
                                price: price,
                                probability: clamp01(price),
                                source: 'POLYMARKET',
                            });
                            pricesFetched++;
                        }
                    }
                }
            } else {
                // For multiple outcomes, fetch each outcome's token
                for (const outcome of event.outcomes || []) {
                    if (outcome.polymarketOutcomeId) {
                        const price = await fetchLivePrice(outcome.polymarketOutcomeId);
                        if (price !== undefined) {
                            oddsRows.push({
                                eventId: event.id,
                                outcomeId: outcome.id,
                                polymarketTokenId: outcome.polymarketOutcomeId,
                                timestamp: new Date(bucketTs),
                                price: price,
                                probability: clamp01(price),
                                source: 'POLYMARKET',
                            });
                            pricesFetched++;
                        }
                    }
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (err) {
            console.error(`[SyncOdds] Error syncing ${event.title}:`, err);
            errors++;
        }
    }

    // Bulk insert all rows
    if (oddsRows.length > 0) {
        const result = await prisma.oddsHistory.createMany({
            data: oddsRows,
            skipDuplicates: true,
        });
        console.log(`[SyncOdds] Inserted ${result.count} odds history rows`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SyncOdds] Sync complete in ${duration}s. Fetched ${pricesFetched} prices, ${errors} errors.`);
}

// Run if executed directly
if (require.main === module) {
    syncOddsHistory()
        .then(() => {
            console.log('[SyncOdds] Done');
            process.exit(0);
        })
        .catch(err => {
            console.error('[SyncOdds] Fatal error:', err);
            process.exit(1);
        });
}

export { syncOddsHistory };
