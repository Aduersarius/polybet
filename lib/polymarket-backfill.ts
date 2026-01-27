/**
 * Polymarket Backfill Library
 * 
 * Handles fetching historical price data from Polymarket CLOB API
 * and storing it in the OddsHistory table.
 */

import { prisma } from './prisma';

const HISTORY_RESOLUTION = '30m';
const BUCKET_MS = 30 * 60 * 1000; // enforce 30m buckets
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';

function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function normalizeProbability(raw: any) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    if (n > 1 && n <= 100) return clamp01(n / 100);
    return clamp01(n);
}

/**
 * Fetch historical chunks from Polymarket
 */
export async function fetchOddsHistoryChunk(
    tokenId: string,
    startSec: number,
    endSec: number,
): Promise<any[]> {
    const requestedDays = (endSec - startSec) / (24 * 60 * 60);
    const historyMap = new Map<number, any>();

    const historyUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(
        tokenId
    )}&interval=max&fidelity=30`;

    console.log(`[Polymarket-Lib] Fetching history for ${tokenId} (fidelity=30min)`);

    try {
        const historyResp = await fetch(historyUrl, { cache: 'no-store' });
        if (historyResp.ok) {
            const data = await historyResp.json();
            const history = Array.isArray(data?.history) ? data.history : (Array.isArray(data?.prices) ? data.prices : (Array.isArray(data) ? data : []));

            if (history.length > 0) {
                history.forEach((point: any) => {
                    const tsRaw = Number(point.timestamp ?? point.time ?? point.ts ?? point.t);
                    const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
                    if (Number.isFinite(tsSec)) {
                        historyMap.set(tsSec, point);
                    }
                });
            }
        }
    } catch (err) {
        console.warn(`[Polymarket-Lib] History fetch failed for ${tokenId}:`, err);
    }

    return Array.from(historyMap.values());
}

/**
 * Execute backfill for a specific outcome
 */
export async function backfillOddsHistory(params: {
    eventId: string;
    outcomeId: string;
    tokenId: string;
    polymarketStartDate?: string | Date;
    fallbackProbability?: number;
}): Promise<number | undefined> {
    const { eventId, outcomeId, tokenId, polymarketStartDate, fallbackProbability } = params;

    if (!tokenId || tokenId.trim().length === 0) return;

    try {
        const endSec = Math.floor(Date.now() / 1000);
        let startSec: number;

        if (polymarketStartDate) {
            const polyDate = new Date(polymarketStartDate);
            startSec = isNaN(polyDate.getTime()) ? (endSec - 365 * 24 * 60 * 60) : Math.floor(polyDate.getTime() / 1000);
        } else {
            startSec = endSec - 365 * 24 * 60 * 60; // 1 year fallback
        }

        // Final safety bounds
        const now = Math.floor(Date.now() / 1000);
        if (startSec > now) startSec = now - 365 * 24 * 60 * 60;

        const allPoints = await fetchOddsHistoryChunk(tokenId, startSec, endSec);

        let effectivePoints = allPoints;
        if (!effectivePoints.length && fallbackProbability !== undefined) {
            effectivePoints = [{
                timestamp: Date.now(),
                price: fallbackProbability,
                probability: clamp01(fallbackProbability),
            }];
        }

        const bucketedRows = [];
        const seenBuckets = new Set<number>();

        for (const p of effectivePoints) {
            const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
            if (!Number.isFinite(tsRaw)) continue;
            const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
            const bucketTs = Math.floor(tsMs / BUCKET_MS) * BUCKET_MS;

            if (seenBuckets.has(bucketTs)) continue;
            seenBuckets.add(bucketTs);

            const priceRaw = p.price ?? p.probability ?? p.p ?? p.value;
            if (priceRaw == null) continue;

            bucketedRows.push({
                eventId,
                outcomeId,
                polymarketTokenId: tokenId,
                timestamp: new Date(bucketTs),
                price: Number(priceRaw),
                probability: normalizeProbability(priceRaw),
                source: 'POLYMARKET',
            });
        }

        if (bucketedRows.length > 0) {
            const result = await prisma.oddsHistory.createMany({
                data: bucketedRows,
                skipDuplicates: true,
            });
            console.log(`[Polymarket-Lib] Stored ${result.count} history rows for ${tokenId}`);

            // Return latest probability for seeding
            const latest = bucketedRows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
            return latest.probability;
        }

        return undefined;
    } catch (err) {
        console.error(`[Polymarket-Lib] Backfill failed for ${tokenId}:`, err);
        return undefined;
    }
}

/**
 * Trigger background backfill for an event's outcomes
 */
export function triggerBackgroundBackfill(params: Array<{
    eventId: string;
    outcomeId: string;
    tokenId: string;
    polymarketStartDate?: string | Date;
    fallbackProbability?: number;
}>) {
    // Process sequentially in background to avoid hitting rate limits or DB pool limits
    setImmediate(async () => {
        console.log(`[Polymarket-Lib] Starting background backfill for ${params.length} outcomes`);
        for (const param of params) {
            try {
                await backfillOddsHistory(param);
                // Graceful delay between outcomes to be KIND to Polymarket API
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`[Polymarket-Lib] Background job failed for ${param.tokenId}:`, err);
            }
        }

        // After all outcomes are backfilled, refresh the optimized view
        try {
            const { triggerBackgroundRefresh } = await import('./odds-history-refresh');
            triggerBackgroundRefresh();
        } catch (err) {
            console.warn('[Polymarket-Lib] Failed to trigger view refresh:', err);
        }
    });
}
