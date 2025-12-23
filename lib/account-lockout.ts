/**
 * Account lockout utility for failed login attempt tracking
 * Implements exponential backoff lockout strategy
 */

import { redis } from './redis';
import { prisma } from './prisma';

const isProd = process.env.NODE_ENV === 'production';

// Lockout configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATIONS = [
    5 * 60 * 1000,      // 5 minutes after 5 failed attempts
    15 * 60 * 1000,    // 15 minutes after 10 failed attempts
    60 * 60 * 1000,    // 1 hour after 15 failed attempts
];

export interface LockoutStatus {
    isLocked: boolean;
    remainingAttempts?: number;
    lockoutExpiresAt?: Date;
    lockoutDuration?: number;
}

/**
 * Records a failed login attempt
 * Returns lockout status after recording
 */
export async function recordFailedAttempt(identifier: string): Promise<LockoutStatus> {
    const key = `lockout:${identifier}`;
    const attemptsKey = `lockout:attempts:${identifier}`;

    try {
        if (!redis || (redis as any).status !== 'ready') {
            // If Redis unavailable in production, fail closed (lock account)
            if (isProd) {
                console.error('[account-lockout] Redis unavailable in production');
                return {
                    isLocked: true,
                    lockoutExpiresAt: new Date(Date.now() + LOCKOUT_DURATIONS[0]),
                    lockoutDuration: LOCKOUT_DURATIONS[0]
                };
            }
            // In dev, allow but log
            return { isLocked: false, remainingAttempts: MAX_ATTEMPTS - 1 };
        }

        // Increment failed attempts
        const attempts = await redis.incr(attemptsKey);
        
        // Set expiration on attempts counter (24 hours)
        if (attempts === 1) {
            await redis.expire(attemptsKey, 86400);
        }

        // Determine lockout duration based on attempt count
        let lockoutDuration = 0;
        if (attempts >= 15) {
            lockoutDuration = LOCKOUT_DURATIONS[2]; // 1 hour
        } else if (attempts >= 10) {
            lockoutDuration = LOCKOUT_DURATIONS[1]; // 15 minutes
        } else if (attempts >= MAX_ATTEMPTS) {
            lockoutDuration = LOCKOUT_DURATIONS[0]; // 5 minutes
        }

        if (lockoutDuration > 0) {
            // Set lockout
            const expiresAt = Date.now() + lockoutDuration;
            await redis.setex(key, Math.ceil(lockoutDuration / 1000), expiresAt.toString());
            
            return {
                isLocked: true,
                lockoutExpiresAt: new Date(expiresAt),
                lockoutDuration
            };
        }

        return {
            isLocked: false,
            remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts)
        };
    } catch (error) {
        console.error('[account-lockout] Error recording failed attempt:', error);
        // Fail closed in production
        if (isProd) {
            return {
                isLocked: true,
                lockoutExpiresAt: new Date(Date.now() + LOCKOUT_DURATIONS[0]),
                lockoutDuration: LOCKOUT_DURATIONS[0]
            };
        }
        return { isLocked: false, remainingAttempts: MAX_ATTEMPTS - 1 };
    }
}

/**
 * Checks if an account is currently locked out
 */
export async function checkLockout(identifier: string): Promise<LockoutStatus> {
    const key = `lockout:${identifier}`;

    try {
        if (!redis || (redis as any).status !== 'ready') {
            // In production, if Redis unavailable, assume not locked (but log error)
            if (isProd) {
                console.error('[account-lockout] Redis unavailable - cannot check lockout');
            }
            return { isLocked: false };
        }

        const lockoutData = await redis.get(key);
        
        if (!lockoutData) {
            return { isLocked: false };
        }

        const expiresAt = parseInt(lockoutData, 10);
        const now = Date.now();

        if (expiresAt > now) {
            return {
                isLocked: true,
                lockoutExpiresAt: new Date(expiresAt),
                lockoutDuration: expiresAt - now
            };
        }

        // Lockout expired, clean up
        await redis.del(key);
        return { isLocked: false };
    } catch (error) {
        console.error('[account-lockout] Error checking lockout:', error);
        // Fail open (assume not locked) to avoid blocking legitimate users
        return { isLocked: false };
    }
}

/**
 * Clears lockout and failed attempts on successful login
 */
export async function clearLockout(identifier: string): Promise<void> {
    const key = `lockout:${identifier}`;
    const attemptsKey = `lockout:attempts:${identifier}`;

    try {
        if (redis && (redis as any).status === 'ready') {
            await Promise.all([
                redis.del(key),
                redis.del(attemptsKey)
            ]);
        }
    } catch (error) {
        console.error('[account-lockout] Error clearing lockout:', error);
        // Non-blocking error
    }
}

/**
 * Gets lockout status for a user (by email or user ID)
 */
export async function getLockoutStatus(identifier: string): Promise<LockoutStatus> {
    return checkLockout(identifier);
}

/**
 * Admin function to manually unlock an account
 */
export async function unlockAccount(identifier: string): Promise<boolean> {
    try {
        await clearLockout(identifier);
        return true;
    } catch (error) {
        console.error('[account-lockout] Error unlocking account:', error);
        return false;
    }
}


