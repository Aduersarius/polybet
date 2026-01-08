/**
 * Backfill Job Queue
 * 
 * Enables async processing of odds history backfill jobs.
 * Jobs are queued via Redis and processed by a background worker.
 */

import { redis } from './redis';

export interface BackfillJob {
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

/**
 * Queue a backfill job for background processing
 */
export async function queueBackfillJob(job: Omit<BackfillJob, 'id' | 'queuedAt' | 'attempts'>): Promise<string> {
    if (!redis) {
        console.warn('[BackfillQueue] Redis unavailable, backfill will not be queued');
        return '';
    }

    const id = `${job.eventId}-${job.outcomeId}-${Date.now()}`;
    const fullJob: BackfillJob = {
        ...job,
        id,
        queuedAt: Date.now(),
        attempts: 0,
    };

    try {
        await redis.lpush(QUEUE_KEY, JSON.stringify(fullJob));
        console.log(`[BackfillQueue] Queued backfill job: ${id}`);
        return id;
    } catch (err) {
        console.error('[BackfillQueue] Failed to queue job:', err);
        return '';
    }
}

/**
 * Get next backfill job from queue
 */
export async function getNextBackfillJob(): Promise<BackfillJob | null> {
    if (!redis) return null;

    try {
        // Move job from queue to processing (atomic operation)
        const jobStr = await redis.rpoplpush(QUEUE_KEY, PROCESSING_KEY);
        if (!jobStr) return null;

        const job = JSON.parse(jobStr) as BackfillJob;
        job.attempts++;

        // Update attempts count in processing list
        await redis.lrem(PROCESSING_KEY, 1, jobStr);
        await redis.lpush(PROCESSING_KEY, JSON.stringify(job));

        return job;
    } catch (err) {
        console.error('[BackfillQueue] Failed to get next job:', err);
        return null;
    }
}

/**
 * Mark job as complete (remove from processing)
 */
export async function completeBackfillJob(job: BackfillJob): Promise<void> {
    if (!redis) return;

    try {
        await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));
        console.log(`[BackfillQueue] Completed job: ${job.id}`);
    } catch (err) {
        console.error('[BackfillQueue] Failed to complete job:', err);
    }
}

/**
 * Mark job as failed (retry or move to dead letter)
 */
export async function failBackfillJob(job: BackfillJob, error: Error): Promise<void> {
    if (!redis) return;

    try {
        // Remove from processing
        await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));

        if (job.attempts >= MAX_ATTEMPTS) {
            // Move to dead letter queue
            await redis.lpush(DEAD_LETTER_KEY, JSON.stringify({
                ...job,
                error: error.message,
                failedAt: Date.now(),
            }));
            console.warn(`[BackfillQueue] Job ${job.id} moved to dead letter (max attempts reached)`);
        } else {
            // Re-queue for retry
            await redis.lpush(QUEUE_KEY, JSON.stringify(job));
            console.log(`[BackfillQueue] Job ${job.id} re-queued (attempt ${job.attempts}/${MAX_ATTEMPTS})`);
        }
    } catch (err) {
        console.error('[BackfillQueue] Failed to handle job failure:', err);
    }
}

/**
 * Get queue statistics
 */
export async function getBackfillQueueStats(): Promise<{
    pending: number;
    processing: number;
    deadLetter: number;
}> {
    if (!redis) {
        return { pending: 0, processing: 0, deadLetter: 0 };
    }

    try {
        const [pending, processing, deadLetter] = await Promise.all([
            redis.llen(QUEUE_KEY),
            redis.llen(PROCESSING_KEY),
            redis.llen(DEAD_LETTER_KEY),
        ]);

        return { pending, processing, deadLetter };
    } catch (err) {
        console.error('[BackfillQueue] Failed to get stats:', err);
        return { pending: 0, processing: 0, deadLetter: 0 };
    }
}

/**
 * Clear stuck jobs from processing queue (recovery after crash)
 */
export async function recoverStuckJobs(): Promise<number> {
    if (!redis) return 0;

    try {
        // Move all processing jobs back to queue
        let recovered = 0;
        let jobStr: string | null;

        while ((jobStr = await redis.rpop(PROCESSING_KEY))) {
            await redis.lpush(QUEUE_KEY, jobStr);
            recovered++;
        }

        if (recovered > 0) {
            console.log(`[BackfillQueue] Recovered ${recovered} stuck jobs`);
        }

        return recovered;
    } catch (err) {
        console.error('[BackfillQueue] Failed to recover stuck jobs:', err);
        return 0;
    }
}
