import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 10;

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    try {
        const { getOrSet } = await import('@/lib/cache');
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q');

        if (!query || query.trim().length === 0) {
            return NextResponse.json({ events: [] });
        }

        // Cache search results with enhanced TTL
        const events = await getOrSet(
            `search:${query.toLowerCase()}`,
            async () => {
                const { prisma } = await import('@/lib/prisma');

                // Use indexed contains search
                const searchPromise = prisma.event.findMany({
                    where: {
                        status: 'ACTIVE',
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
                    },
                    select: {
                        id: true,
                        title: true,
                        categories: true,
                        resolutionDate: true,
                        imageUrl: true,
                    },
                    take: 20,
                    orderBy: {
                        createdAt: 'desc',
                    },
                });

                // Add timeout for the search query
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Database query timeout')), 8000);
                });

                return await Promise.race([searchPromise, timeoutPromise]);
            },
            { ttl: 300, prefix: 'search' } // Cache for 5 minutes
        );

        const queryTime = Date.now() - startTime;
        console.log(`✅ Search "${query}": ${events.length} results in ${queryTime}ms`);

        return NextResponse.json({ events });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Search failed after ${errorTime}ms:`, error);

        let statusCode = 500;
        let errorMessage = 'Failed to search events';

        if (error instanceof Error && error.message === 'Database query timeout') {
            statusCode = 504;
            errorMessage = 'Search query took too long to execute';
        }

        return NextResponse.json(
            { error: errorMessage },
            { status: statusCode }
        );
    }
}
