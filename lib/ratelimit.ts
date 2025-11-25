/**
 * Rate Limiting Utilities
 * 
 * Provides rate limiting for API endpoints to prevent abuse and overload
 */

import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";
import { NextResponse } from "next/server";

// Standard API rate limiter - 100 requests per minute
export const apiLimiter = redis
    ? new Ratelimit({
        redis: redis as any,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        analytics: true,
        prefix: "@upstash/ratelimit/api",
    })
    : null;

// Heavy operation limiter - 20 requests per minute
export const heavyLimiter = redis
    ? new Ratelimit({
        redis: redis as any,
        limiter: Ratelimit.slidingWindow(20, "1 m"),
        analytics: true,
        prefix: "@upstash/ratelimit/heavy",
    })
    : null;

// Search limiter - 30 requests per minute
export const searchLimiter = redis
    ? new Ratelimit({
        redis: redis as any,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        analytics: true,
        prefix: "@upstash/ratelimit/search",
    })
    : null;

/**
 * Apply rate limiting to a request
 * Returns null if allowed, or a NextResponse with 429 status if rate limited
 */
export async function checkRateLimit(
    limiter: Ratelimit | null,
    identifier: string
): Promise<NextResponse | null> {
    if (!limiter) {
        // If rate limiting is not available (no Redis), allow all requests
        return null;
    }

    try {
        const { success, limit, remaining, reset } = await limiter.limit(identifier);

        if (!success) {
            return NextResponse.json(
                {
                    error: "Rate limit exceeded",
                    message: "Too many requests. Please try again later.",
                    limit,
                    remaining: 0,
                    reset: new Date(reset).toISOString(),
                },
                {
                    status: 429,
                    headers: {
                        "X-RateLimit-Limit": limit.toString(),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": reset.toString(),
                        "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
                    },
                }
            );
        }

        // Request is allowed
        return null;
    } catch (error) {
        console.error("Rate limit check failed:", error);
        // On error, allow the request but log the issue
        return null;
    }
}

/**
 * Get identifier for rate limiting
 * Uses IP address or user ID
 */
export function getRateLimitIdentifier(request: Request, userId?: string): string {
    if (userId) {
        return `user:${userId}`;
    }

    // Try to get IP from various headers (Vercel, Cloudflare, etc.)
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0] || realIp || "anonymous";

    return `ip:${ip}`;
}
