import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RequestQueue } from '@/lib/queue';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// GET /api/events/[id]/bets - Get recent bets for an event with lazy loading
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    // Note: This endpoint is public for viewing event activity
    // Authentication is not required for reading public bet data
    // await requireAuth(request); // Removed for public access

    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id: eventId } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
        const cursor = searchParams.get('cursor');

        // Use request queuing for database operations
        const result = await RequestQueue.enqueue(
            `bets:${eventId}`,
            async () => {
                const cacheKey = `event:${eventId}:bets:${limit}:${cursor || 'latest'}`;

                return await getOrSet(
                    cacheKey,
                    async () => {
                        const whereClause: any = { eventId };

                        if (cursor) {
                            whereClause.createdAt = { lt: new Date(cursor) };
                        }

                        const bets = await (prisma as any).marketActivity.findMany({
                            where: {
                                ...whereClause,
                                type: { in: ['BET', 'TRADE'] }
                            },
                            orderBy: { createdAt: 'desc' },
                            take: limit + 1,
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        address: true,
                                        avatarUrl: true,
                                        image: true, // Include image field from Better Auth
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
                    { ttl: 30, prefix: 'bets' }
                );
            }
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching bets:', error);

        let statusCode = 500;
        let errorMessage = 'Failed to fetch bets';

        if ((error as any)?.statusCode === 503) {
            statusCode = 503;
            errorMessage = 'Service temporarily unavailable - too many requests';
        }

        return NextResponse.json(
            { error: errorMessage },
            { status: statusCode }
        );
    }
}
