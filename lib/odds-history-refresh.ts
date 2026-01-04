/**
 * OddsHistoryHourly Materialized View Refresh Manager
 * 
 * Manages lazy refresh of the OddsHistoryHourly materialized view.
 * Uses Redis to track last refresh time and prevent concurrent refreshes.
 */

import { prisma } from './prisma';
import { redis } from './redis';

const REFRESH_KEY = 'odds_history_hourly:last_refresh';
const LOCK_KEY = 'odds_history_hourly:refresh_lock';
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_TTL_SECONDS = 120; // 2 minutes max for refresh

/**
 * Check if the materialized view needs refresh
 */
export async function isViewStale(): Promise<boolean> {
    if (!redis) return false; // Can't track without Redis

    try {
        const status = (redis as any)?.status;
        if (status !== 'ready') return false;

        const lastRefresh = await redis.get(REFRESH_KEY);
        if (!lastRefresh) return true; // Never refreshed

        const lastRefreshTime = parseInt(lastRefresh, 10);
        return Date.now() - lastRefreshTime > STALE_THRESHOLD_MS;
    } catch {
        return false; // Assume not stale on error
    }
}

/**
 * Attempt to acquire refresh lock (prevents concurrent refreshes)
 */
async function acquireLock(): Promise<boolean> {
    if (!redis) return false;

    try {
        const status = (redis as any)?.status;
        if (status !== 'ready') return false;

        // SET NX (only if not exists) with TTL
        const result = await redis.set(LOCK_KEY, Date.now().toString(), 'EX', LOCK_TTL_SECONDS, 'NX');
        return result === 'OK';
    } catch {
        return false;
    }
}

/**
 * Release the refresh lock
 */
async function releaseLock(): Promise<void> {
    if (!redis) return;

    try {
        await redis.del(LOCK_KEY);
    } catch {
        // Ignore errors
    }
}

/**
 * Update the last refresh timestamp
 */
async function updateLastRefresh(): Promise<void> {
    if (!redis) return;

    try {
        const status = (redis as any)?.status;
        if (status !== 'ready') return;

        await redis.set(REFRESH_KEY, Date.now().toString(), 'EX', 86400); // TTL 24h
    } catch {
        // Ignore errors
    }
}

/**
 * Refresh the OddsHistoryHourly materialized view
 * 
 * @param force - If true, skip staleness check
 * @returns Result object with success status and timing
 */
export async function refreshOddsHistoryView(force = false): Promise<{
    success: boolean;
    skipped?: boolean;
    reason?: string;
    duration?: number;
}> {
    // Check if refresh is needed
    if (!force) {
        const stale = await isViewStale();
        if (!stale) {
            return { success: true, skipped: true, reason: 'View is fresh' };
        }
    }

    // Try to acquire lock (prevent concurrent refreshes)
    const lockAcquired = await acquireLock();
    if (!lockAcquired) {
        return { success: true, skipped: true, reason: 'Refresh already in progress' };
    }

    const startTime = Date.now();

    try {
        console.log('[OddsHistoryHourly] Starting refresh...');

        // Try REFRESH CONCURRENTLY first (doesn't block queries)
        try {
            await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY "OddsHistoryHourly"`;
        } catch (concurrentError: any) {
            const errorMsg = concurrentError?.meta?.driverAdapterError?.message || '';
            if (errorMsg.includes('concurrently')) {
                console.log('[OddsHistoryHourly] CONCURRENTLY not available, using regular refresh...');
                await prisma.$executeRaw`REFRESH MATERIALIZED VIEW "OddsHistoryHourly"`;
            } else {
                throw concurrentError;
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[OddsHistoryHourly] Refresh completed in ${duration}ms`);

        // Update last refresh timestamp
        await updateLastRefresh();

        return { success: true, duration };
    } catch (error) {
        console.error('[OddsHistoryHourly] Refresh failed:', error);
        return { success: false, reason: String(error) };
    } finally {
        await releaseLock();
    }
}

/**
 * Trigger a background refresh if the view is stale
 * This is fire-and-forget - doesn't block the caller
 */
export function triggerBackgroundRefresh(): void {
    // Use setImmediate to not block the current request
    setImmediate(async () => {
        try {
            await refreshOddsHistoryView();
        } catch (error) {
            console.error('[OddsHistoryHourly] Background refresh error:', error);
        }
    });
}
