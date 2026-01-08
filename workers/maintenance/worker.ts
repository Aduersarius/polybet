/**
 * Unified Maintenance Worker
 * 
 * Runs on VPS as Docker container. Handles:
 * 1. Backfill queue processing (continuous)
 * 2. Periodic OddsHistory sync (every 30 min)
 * 
 * Docker: workers/maintenance/Dockerfile
 */

import { Pool } from 'pg';
import Redis from 'ioredis';

// ============ Configuration ============

const DATABASE_URL = process.env.DATABASE_URL!;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const WORKER_POLL_MS = 1000; // 1 second
const BUCKET_MS = 30 * 60 * 1000; // 30-minute buckets

// ============ Database Setup ============

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

// ============ Utility Functions ============

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function normalizeProbability(raw: any): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    if (n > 1 && n <= 100) return clamp01(n / 100);
    return clamp01(n);
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
        return bestBid ?? bestAsk;
    } catch {
        return undefined;
    }
}

// ============ Backfill Queue ============

interface BackfillJob {
    id: string;
    eventId: string;
    outcomeId: string;
    tokenId: string;
    marketId?: string;
    polymarketStartDate?: string;
    probability?: number;
    queuedAt: number;
    attempts: number;
}

const QUEUE_KEY = 'backfill:jobs';
const PROCESSING_KEY = 'backfill:processing';
const DEAD_LETTER_KEY = 'backfill:dead-letter';
const MAX_ATTEMPTS = 3;

async function getNextBackfillJob(): Promise<BackfillJob | null> {
    try {
        const jobStr = await redis.rpoplpush(QUEUE_KEY, PROCESSING_KEY);
        if (!jobStr) return null;

        const job = JSON.parse(jobStr) as BackfillJob;
        job.attempts++;

        await redis.lrem(PROCESSING_KEY, 1, jobStr);
        await redis.lpush(PROCESSING_KEY, JSON.stringify(job));

        return job;
    } catch (err) {
        console.error('[Backfill] Failed to get next job:', err);
        return null;
    }
}

async function completeBackfillJob(job: BackfillJob): Promise<void> {
    await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));
    console.log(`[Backfill] ✅ Completed: ${job.eventId}/${job.outcomeId}`);
}

async function failBackfillJob(job: BackfillJob, error: Error): Promise<void> {
    await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));

    if (job.attempts >= MAX_ATTEMPTS) {
        await redis.lpush(DEAD_LETTER_KEY, JSON.stringify({
            ...job,
            error: error.message,
            failedAt: Date.now(),
        }));
        console.warn(`[Backfill] ❌ Dead letter: ${job.id}`);
    } else {
        await redis.lpush(QUEUE_KEY, JSON.stringify(job));
        console.log(`[Backfill] Retry ${job.attempts}/${MAX_ATTEMPTS}: ${job.id}`);
    }
}

async function processBackfillJob(job: BackfillJob): Promise<void> {
    console.log(`[Backfill] Processing: ${job.eventId}/${job.outcomeId}`);

    const endSec = Math.floor(Date.now() / 1000);
    let startSec = endSec - 365 * 24 * 60 * 60;

    if (job.polymarketStartDate) {
        const polyDate = new Date(job.polymarketStartDate);
        if (!isNaN(polyDate.getTime())) {
            startSec = Math.max(startSec, Math.floor(polyDate.getTime() / 1000));
        }
    }

    const historyUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(job.tokenId)}&interval=max&fidelity=30`;
    const resp = await fetch(historyUrl, { cache: 'no-store' });

    if (!resp.ok) {
        throw new Error(`Polymarket API: ${resp.status}`);
    }

    const data = await resp.json();
    const history = Array.isArray(data?.history) ? data.history
        : Array.isArray(data?.prices) ? data.prices
            : Array.isArray(data) ? data : [];

    if (history.length === 0) {
        console.log(`[Backfill] No history for ${job.tokenId}`);
        return;
    }

    const bucketedMap = new Map<number, any>();
    for (const p of history) {
        const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
        if (!Number.isFinite(tsRaw)) continue;

        const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
        const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;

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
        });
    }

    const rows = Array.from(bucketedMap.values());
    if (rows.length === 0) return;

    // Batch insert
    const values = rows.map((r, i) => {
        const base = i * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'POLYMARKET')`;
    }).join(', ');

    const params = rows.flatMap(r => [
        r.eventId, r.outcomeId, r.polymarketTokenId,
        new Date(r.timestampMs), r.probability
    ]);

    await pool.query(`
    INSERT INTO "OddsHistory" ("eventId", "outcomeId", "polymarketTokenId", "timestamp", "probability", "source")
    VALUES ${values}
    ON CONFLICT DO NOTHING
  `, params);

    console.log(`[Backfill] Inserted ${rows.length} rows for ${job.eventId}/${job.outcomeId}`);

    // Update outcome probability with latest
    const latestRow = rows[rows.length - 1];
    if (latestRow) {
        await pool.query(`
      UPDATE "Outcome" SET probability = $1 WHERE id = $2
    `, [latestRow.probability, job.outcomeId]);
    }
}

// ============ Periodic Sync ============

async function syncOddsHistory(): Promise<void> {
    console.log('[Sync] Starting periodic odds sync...');
    const startTime = Date.now();

    const mappingsResult = await pool.query(`
    SELECT pm.*, e.id as event_id, e.type
    FROM "PolymarketMarketMapping" pm
    JOIN "Event" e ON pm."internalEventId" = e.id
    WHERE pm."isActive" = true AND e.status = 'ACTIVE'
      AND (pm."yesTokenId" IS NOT NULL OR pm."noTokenId" IS NOT NULL OR pm."outcomeMapping" IS NOT NULL)
  `);

    console.log(`[Sync] Found ${mappingsResult.rows.length} active mappings`);

    const bucketTs = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    let inserted = 0;
    let errors = 0;

    for (const mapping of mappingsResult.rows) {
        try {
            // Get outcomes for this event
            const outcomesResult = await pool.query(`
        SELECT id, name, "polymarketOutcomeId" FROM "Outcome" WHERE "eventId" = $1
      `, [mapping.event_id]);

            for (const outcome of outcomesResult.rows) {
                const tokenId = outcome.polymarketOutcomeId ||
                    (mapping.type === 'BINARY' && outcome.name?.toUpperCase() === 'YES' ? mapping.yesTokenId : null) ||
                    (mapping.type === 'BINARY' && outcome.name?.toUpperCase() === 'NO' ? mapping.noTokenId : null);

                if (!tokenId) continue;

                const price = await fetchLivePrice(tokenId);
                if (price === undefined) continue;

                await pool.query(`
          INSERT INTO "OddsHistory" ("eventId", "outcomeId", "polymarketTokenId", "timestamp", "probability", "source")
          VALUES ($1, $2, $3, $4, $5, 'POLYMARKET')
          ON CONFLICT DO NOTHING
        `, [mapping.event_id, outcome.id, tokenId, new Date(bucketTs), clamp01(price)]);

                await pool.query(`UPDATE "Outcome" SET probability = $1 WHERE id = $2`, [clamp01(price), outcome.id]);

                inserted++;
                await new Promise(r => setTimeout(r, 50)); // Rate limit
            }
        } catch (err) {
            console.error(`[Sync] Error for ${mapping.event_id}:`, err);
            errors++;
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Sync] ✅ Done in ${duration}s. Inserted: ${inserted}, Errors: ${errors}`);
}

// ============ Recovery ============

async function recoverStuckJobs(): Promise<void> {
    let recovered = 0;
    let jobStr: string | null;

    while ((jobStr = await redis.rpop(PROCESSING_KEY))) {
        await redis.lpush(QUEUE_KEY, jobStr);
        recovered++;
    }

    if (recovered > 0) {
        console.log(`[Recovery] Recovered ${recovered} stuck jobs`);
    }
}

// ============ Main Loop ============

async function runWorker(): Promise<void> {
    console.log('🚀 Maintenance Worker starting...');
    console.log(`   Database: ${DATABASE_URL.split('@')[1]?.split('/')[0] || 'configured'}`);
    console.log(`   Redis: ${REDIS_URL.split('@')[1] || REDIS_URL}`);

    // Recover stuck jobs from previous run
    await recoverStuckJobs();

    // Initial sync
    await syncOddsHistory();

    // Schedule periodic sync
    setInterval(syncOddsHistory, SYNC_INTERVAL_MS);
    console.log(`[Sync] Scheduled every ${SYNC_INTERVAL_MS / 60000} minutes`);

    // Process backfill queue continuously
    console.log('[Backfill] Listening for jobs...');

    while (true) {
        try {
            const job = await getNextBackfillJob();

            if (job) {
                try {
                    await processBackfillJob(job);
                    await completeBackfillJob(job);
                } catch (err) {
                    await failBackfillJob(job, err as Error);
                }
            }

            await new Promise(r => setTimeout(r, job ? WORKER_POLL_MS : 5000));
        } catch (err) {
            console.error('[Worker] Error:', err);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// Handle shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down...');
    await pool.end();
    redis.disconnect();
    process.exit(0);
});

runWorker().catch(console.error);
