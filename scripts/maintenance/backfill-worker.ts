#!/usr/bin/env npx ts-node
/**
 * Backfill Worker
 * 
 * Background worker that processes odds history backfill jobs.
 * Run this as a separate process: npx ts-node scripts/maintenance/backfill-worker.ts
 */

import {
    getNextBackfillJob,
    completeBackfillJob,
    failBackfillJob,
    recoverStuckJobs,
    getBackfillQueueStats,
    BackfillJob
} from '../../lib/backfill-queue';
import { prisma } from '../../lib/prisma';

// Import the backfill function from approve route (we'll extract it)
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
const BUCKET_MS = 30 * 60 * 1000; // 30-minute buckets

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

async function processBackfillJob(job: BackfillJob): Promise<void> {
    console.log(`[BackfillWorker] Processing job ${job.id} for ${job.eventId}/${job.outcomeId}`);

    const endSec = Math.floor(Date.now() / 1000);
    let startSec: number;

    // Determine start date
    if (job.polymarketStartDate) {
        const polyDate = new Date(job.polymarketStartDate);
        if (!isNaN(polyDate.getTime())) {
            startSec = Math.floor(polyDate.getTime() / 1000);
            if (startSec > endSec) {
                startSec = endSec - 365 * 24 * 60 * 60;
            }
        } else {
            startSec = endSec - 365 * 24 * 60 * 60;
        }
    } else {
        startSec = endSec - 365 * 24 * 60 * 60;
    }

    // Fetch history from Polymarket
    const historyUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(job.tokenId)}&interval=max&fidelity=30`;

    const resp = await fetch(historyUrl, { cache: 'no-store' });
    if (!resp.ok) {
        throw new Error(`Polymarket API error: ${resp.status}`);
    }

    const data = await resp.json();
    const history = Array.isArray(data?.history)
        ? data.history
        : Array.isArray(data?.prices)
            ? data.prices
            : Array.isArray(data)
                ? data
                : [];

    if (history.length === 0) {
        console.log(`[BackfillWorker] No history data for ${job.tokenId}`);
        return;
    }

    // Bucket into 30-minute intervals
    const bucketedMap = new Map<number, any>();
    for (const p of history) {
        const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
        if (!Number.isFinite(tsRaw)) continue;

        const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
        const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;

        // Filter by date range
        if (tsSec < startSec || tsSec > endSec) continue;

        const bucketTs = Math.floor(tsMs / BUCKET_MS) * BUCKET_MS;
        const priceRaw = p.price ?? p.probability ?? p.p ?? p.value;
        if (priceRaw == null) continue;

        const prob = normalizeProbability(priceRaw);
        bucketedMap.set(bucketTs, {
            eventId: job.eventId,
            outcomeId: job.outcomeId,
            polymarketTokenId: job.tokenId,
            timestampMs: bucketTs,
            price: Number(priceRaw),
            probability: prob,
            source: 'POLYMARKET',
        });
    }

    const rows = Array.from(bucketedMap.values());
    if (rows.length === 0) {
        console.log(`[BackfillWorker] No valid rows after processing for ${job.tokenId}`);
        return;
    }

    // Insert into OddsHistory
    const result = await prisma.oddsHistory.createMany({
        data: rows.map((r: any) => {
            const { timestampMs, ...rest } = r;
            return {
                ...rest,
                timestamp: new Date(timestampMs),
            };
        }),
        skipDuplicates: true,
    });

    console.log(`[BackfillWorker] Inserted ${result.count} rows for ${job.eventId}/${job.outcomeId}`);
}

async function runWorker(): Promise<void> {
    console.log('[BackfillWorker] Starting...');

    // Recover any stuck jobs from previous run
    await recoverStuckJobs();

    const POLL_INTERVAL = 1000; // 1 second
    const IDLE_INTERVAL = 5000; // 5 seconds when queue is empty

    while (true) {
        try {
            const job = await getNextBackfillJob();

            if (!job) {
                // No jobs, wait longer
                await new Promise(resolve => setTimeout(resolve, IDLE_INTERVAL));
                continue;
            }

            try {
                await processBackfillJob(job);
                await completeBackfillJob(job);
            } catch (err) {
                console.error(`[BackfillWorker] Job ${job.id} failed:`, err);
                await failBackfillJob(job, err as Error);
            }

            // Small delay between jobs
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        } catch (err) {
            console.error('[BackfillWorker] Worker error:', err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Run if executed directly
if (require.main === module) {
    runWorker().catch(console.error);
}

export { runWorker, processBackfillJob };
