import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    // Rate limiting - use search limiter
    const { searchLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
    const identifier = getRateLimitIdentifier(request);
    const rateLimitResponse = await checkRateLimit(searchLimiter, identifier);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { getOrSet } = await import('@/lib/cache');
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q');

        if (!query || query.trim().length === 0) {
            return NextResponse.json({ events: [] });
        }

        // Cache search results
        const events = await getOrSet(
            `search:${query.toLowerCase()}`,
            async () => {
                const { prisma } = await import('@/lib/prisma');

                const queryPromise = prisma.event.findMany({
                    where: {
                        OR: [
                            {
                                title: {
                                    contains: query,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                description: {
                                    contains: query,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                categories: {
                                    has: query,
                                },
                            },
                        ],
                        status: 'ACTIVE'
                    },
                    select: {
                        id: true,
                        title: true,
                        categories: true,
                        resolutionDate: true,
                        imageUrl: true,
                    },
                    take: 20, // Increased limit for better search results
                    orderBy: {
                        createdAt: 'desc',
                    },
                });

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Database query timeout')), 8000);
                });

                return await Promise.race([queryPromise, timeoutPromise]) as any[];
            },
            { ttl: 300, prefix: 'search' } // Cache for 5 minutes
        );

        const queryTime = Date.now() - startTime;
        console.log(`✅ Search "${query}": ${events.length} results in ${queryTime}ms`);

        return NextResponse.json({ events });
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Search failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Search query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json(
            { error: 'Failed to search events' },
            { status: 500 }
        );
    }
}
