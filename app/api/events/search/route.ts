import { NextRequest, NextResponse } from 'next/server';
import { PerformanceMonitor } from '@/lib/monitoring';
import { RequestQueue } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(request: NextRequest) {
    const startTime = Date.now();
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;

    try {
        // Rate limiting - use search limiter
        const { searchLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
        const identifier = getRateLimitIdentifier(request);
        const rateLimitResponse = await checkRateLimit(searchLimiter, identifier);
        if (rateLimitResponse) {
            await PerformanceMonitor.logRequest(endpoint, method, Date.now() - startTime, false, 429);
            return rateLimitResponse;
        }

        const { getOrSet } = await import('@/lib/cache');
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q');

        if (!query || query.trim().length === 0) {
            await PerformanceMonitor.logRequest(endpoint, method, Date.now() - startTime, true, 200);
            return NextResponse.json({ events: [] });
        }

        // Use request queuing for database operations
        const events = await RequestQueue.enqueue(
            `search:${query.toLowerCase()}`,
            async () => {
                // Cache search results with enhanced TTL
                return await getOrSet(
                    `search:${query.toLowerCase()}`,
                    async () => {
                        const { prisma } = await import('@/lib/prisma');

                        // Use full-text search for better performance and relevance
                        const searchQuery = query.trim().toLowerCase();
                        const queryPromise = prisma.$queryRaw`
                            SELECT
                                id,
                                title,
                                categories,
                                "resolutionDate",
                                "imageUrl",
                                ts_rank("searchVector", plainto_tsquery('english', ${searchQuery})) as rank
                            FROM "Event"
                            WHERE
                                status = 'ACTIVE' AND
                                "searchVector" @@ plainto_tsquery('english', ${searchQuery})
                            ORDER BY rank DESC, "createdAt" DESC
                            LIMIT 20
                        `;

                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Database query timeout')), 8000);
                        });

                        return await Promise.race([queryPromise, timeoutPromise]) as any[];
                    },
                    { ttl: 300, prefix: 'search' } // Cache for 5 minutes (will be optimized to 30 min)
                );
            }
        );

        const queryTime = Date.now() - startTime;
        console.log(`✅ Search "${query}": ${events.length} results in ${queryTime}ms`);

        await PerformanceMonitor.logRequest(endpoint, method, queryTime, true, 200);
        return NextResponse.json({ events });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Search failed after ${errorTime}ms:`, error);

        let statusCode = 500;
        let errorMessage = 'Failed to search events';

        if (error instanceof Error) {
            if (error.message === 'Database query timeout') {
                statusCode = 504;
                errorMessage = 'Search query took too long to execute';
            } else if ((error as any).statusCode === 503) {
                statusCode = 503;
                errorMessage = 'Service temporarily unavailable - too many requests';
            }
        }

        await PerformanceMonitor.logRequest(endpoint, method, errorTime, false, statusCode);

        return NextResponse.json(
            { error: errorMessage },
            { status: statusCode }
        );
    }
}
