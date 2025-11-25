```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RequestQueue } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// GET /api/events/[id]/bets - Get recent bets for an event with lazy loading
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    try {
        // Rate limiting
        const { apiLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
        const identifier = getRateLimitIdentifier(request);
        const rateLimitResponse = await checkRateLimit(apiLimiter, identifier);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const { getOrSet } = await import('@/lib/cache');
        const { id: eventId } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Default 20, max 100
        const cursor = searchParams.get('cursor'); // For pagination

        console.log(`[API] Fetching bets for event: ${ eventId }, limit: ${ limit }, cursor: ${ cursor } `);

        // Use request queuing for database operations
        const result = await RequestQueue.enqueue(
            `bets:${ eventId } `,
            async () => {
                const cacheKey = `event:${ eventId }: bets:${ limit }:${ cursor || 'latest' } `;

                return await getOrSet(
                    cacheKey,
                    async () => {
                        const whereClause: any = { eventId };

                        // Add cursor-based pagination
                        if (cursor) {
                            whereClause.createdAt = { lt: new Date(cursor) };
                        }

                        const bets = await prisma.bet.findMany({
                            where: whereClause,
                            orderBy: { createdAt: 'desc' },
                            take: limit + 1, // Take one extra to check if there are more
                            include: {
                                user: {
                                    select: {
                                        username: true,
                                        address: true,
                                        avatarUrl: true,
                                    },
                                },
                            },
                        });

                        const hasMore = bets.length > limit;
                        const betsToReturn = hasMore ? bets.slice(0, limit) : bets;

                        return {
                            bets: betsToReturn,
                            hasMore,
                            nextCursor: hasMore && betsToReturn.length > 0
                                ? betsToReturn[betsToReturn.length - 1].createdAt.toISOString()
                                : null,
                            totalLoaded: betsToReturn.length
                        };
                    },
                    { ttl: 30, prefix: 'bets' } // 30 second cache for bet data
                );
            }
        );

        const duration = Date.now() - startTime;
        await PerformanceMonitor.logRequest('bets', 'GET', duration, true, 200);

        return NextResponse.json(result);
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error('Error fetching bets:', error);

        let statusCode = 500;
        let errorMessage = 'Failed to fetch bets';

        if ((error as any)?.statusCode === 503) {
            statusCode = 503;
            errorMessage = 'Service temporarily unavailable - too many requests';
        }

        await PerformanceMonitor.logRequest('bets', 'GET', duration, false, statusCode);

        return NextResponse.json(
            { error: errorMessage },
            { status: statusCode }
        );
    }
}
