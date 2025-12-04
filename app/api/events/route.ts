
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 15; // 15 second timeout for Vercel

export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const timeHorizon = searchParams.get('timeHorizon') || 'all'; // 'all', '1d', '1w', '1m'
    const sortBy = searchParams.get('sortBy') || 'newest'; // 'newest', 'volume_high', 'volume_low', 'liquidity_high', 'ending_soon'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Cap at 100
    const offset = parseInt(searchParams.get('offset') || '0');

    // Production-ready: minimal logging

    try {
        const { getOrSet } = await import('@/lib/cache');
        const cacheKey = `${category || 'all'}:${timeHorizon}:${sortBy}:${limit}:${offset}`;

        // Use Redis caching with 600s TTL (10 minutes)
        const result = await getOrSet(
            cacheKey,
            async () => {
                const { prisma } = await import('@/lib/prisma');
                const { categorizeEvent, getAllCategories } = await import('@/lib/category-filters');

                // Build where clause
                let where: any = { isHidden: false, status: 'ACTIVE' };

                // Category filtering
                if (category && category !== 'ALL') {
                    if (getAllCategories().includes(category)) {
                        // Use keyword-based filtering for our defined categories
                        where.OR = [
                            { categories: { has: category } }, // Legacy category field
                            // We'll filter by keywords in JavaScript after fetching
                        ];
                    } else {
                        // Legacy category filtering
                        where.categories = { has: category };
                    }
                }

                // Time horizon filtering
                const now = new Date();
                if (timeHorizon === '1d') {
                    where.resolutionDate = { gte: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
                } else if (timeHorizon === '1w') {
                    where.resolutionDate = { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
                } else if (timeHorizon === '1m') {
                    where.resolutionDate = { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
                }
                // 'all' doesn't add any time filtering

                // Use a single transaction to reduce connection usage
                const result = await prisma.$transaction(async (tx) => {
                    // Get total count
                    const totalCount = await tx.event.count({
                        where: {
                            ...where,
                            status: 'ACTIVE'
                        }
                    });

                    // Build orderBy based on sortBy parameter
                    let orderBy: any = { createdAt: 'desc' }; // default
                    if (sortBy === 'newest') {
                        orderBy = { createdAt: 'desc' };
                    } else if (sortBy === 'ending_soon') {
                        orderBy = { resolutionDate: 'asc' };
                    }
                    // For volume and liquidity sorting, we'll sort in JavaScript after calculating stats

                    // Get events with bets
=======
                    // Build orderBy based on sortBy parameter
                    let orderBy: any = { createdAt: 'desc' }; // default
                    if (sortBy === 'newest') {
                        orderBy = { createdAt: 'desc' };
                    } else if (sortBy === 'ending_soon') {
                        orderBy = { resolutionDate: 'asc' };
                    }
                    // For volume and liquidity sorting, we'll sort in JavaScript after calculating stats

                    // Get events with bets
>>>>>>> ab3e51066a4063d40b5514bb115a453f0305a7eb
                    const events = await tx.event.findMany({
                        where: {
                            ...where,
                            status: 'ACTIVE'
                        },
                        orderBy,
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            categories: true,
                            resolutionDate: true,
                            imageUrl: true,
                            createdAt: true,
                            qYes: true,
                            qNo: true,
                            liquidityParameter: true,
                            type: true,
                            outcomes: {
                                select: {
                                    id: true,
                                    name: true,
                                    probability: true,
                                    color: true,
                                    liquidity: true
                                },
                                orderBy: {
                                    probability: 'desc'
                                }
                            },
                        },
                        take: limit * 2, // Fetch more to allow for keyword filtering
                        skip: offset,
                    });

                    // Get aggregations for volume and betCount
                    const eventIds = events.map(e => e.id);

                    // Volume includes both BET and TRADE
                    const volumeAggregations = await tx.marketActivity.groupBy({
                        by: ['eventId'],
                        where: {
                            eventId: { in: eventIds },
                            type: { in: ['BET', 'TRADE'] }
                        },
                        _sum: { amount: true }
                    });

                    // Bet count only includes BET
                    const betCountAggregations = await tx.marketActivity.groupBy({
                        by: ['eventId'],
                        where: {
                            eventId: { in: eventIds },
                            type: 'BET'
                        },
                        _count: true
                    });

                    return { events, totalCount, volumeAggregations, betCountAggregations };
                });

                const { events, totalCount, volumeAggregations, betCountAggregations } = result;

                // Create maps of eventId to volume and betCount
                const volumeMap = new Map(volumeAggregations.map(agg => [agg.eventId, agg._sum.amount || 0]));
                const betCountMap = new Map(betCountAggregations.map(agg => [agg.eventId, agg._count]));

                const queryTime = Date.now() - startTime;

                console.log(`✅ Events API: ${events.length} events in ${queryTime}ms`);

                // Log events fetch to Braintrust
                try {
                    const { logEventAction } = await import('@/lib/braintrust');
                    await logEventAction('fetch_events', 'all', undefined, {
                        category: category || 'all',
                        eventCount: events.length,
                        queryTime,
                        success: true,
                    });
                } catch (logError) {
                    console.warn('Braintrust logging failed:', logError);
                }

                // Process events with stats and filtering
                let eventsWithStats = events.map(event => {
                    const volume = volumeMap.get(event.id) || 0;
                    const betCount = betCountMap.get(event.id) || 0;
=======
                // Process events with stats and filtering
                let eventsWithStats = events.map(event => {
                    const activities = (event as any).marketActivity || [];
                    const volume = activities.reduce((sum: number, activity: any) => sum + activity.amount, 0);
                    const betCount = activities.length;
>>>>>>> ab3e51066a4063d40b5514bb115a453f0305a7eb

                    // Calculate liquidity (total tokens in the market)
                    let liquidity = 0;
                    if (event.type === 'MULTIPLE') {
                        liquidity = event.outcomes?.reduce((sum: number, outcome: any) => sum + (outcome.liquidity || 0), 0) || 0;
                    } else {
                        liquidity = (event.qYes || 0) + (event.qNo || 0);
                    }

                    // Use pre-calculated AMM state from the Event model
                    let yesOdds = 0.5;
                    let noOdds = 0.5;

                    const qYes = event.qYes || 0;
                    const qNo = event.qNo || 0;
                    const b = event.liquidityParameter || 10000.0;

                    if (qYes > 0 || qNo > 0) {
                        // Calculate odds using actual token positions
                        const diff = (qNo - qYes) / b;
                        const yesPrice = 1 / (1 + Math.exp(diff));
                        yesOdds = yesPrice;
                        noOdds = 1 - yesOdds;
                    } else {
                        // Mock odds logic for demo if no bets
                        const mockScenarios = [
                            { yes: 0.60 }, { yes: 0.40 }, { yes: 0.70 }, { yes: 0.30 }, { yes: 0.50 },
                            { yes: 0.75 }, { yes: 0.25 }, { yes: 0.55 }, { yes: 0.45 }, { yes: 0.65 }
                        ];
                        const scenarioIndex = event.id.split('').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0) % mockScenarios.length;
                        yesOdds = mockScenarios[scenarioIndex].yes;
                        noOdds = 1 - yesOdds;
                    }

                    const { marketActivity, qYes: _, qNo: __, liquidityParameter: ___, ...eventData } = event as any; // Remove bets and AMM state from response
                    return {
                        ...eventData,
                        volume,
                        betCount,
                        liquidity,
                        yesOdds,
                        noOdds
                    };
                });

                // Apply keyword-based category filtering if needed
                if (category && getAllCategories().includes(category)) {
                    eventsWithStats = eventsWithStats.filter(event => {
                        const detectedCategories = categorizeEvent(event.title, event.description || '');
                        return detectedCategories.includes(category);
                    });
                }

                // Apply volume/liquidity sorting
                if (sortBy === 'volume_high') {
                    eventsWithStats.sort((a, b) => (b.volume || 0) - (a.volume || 0));
                } else if (sortBy === 'volume_low') {
                    eventsWithStats.sort((a, b) => (a.volume || 0) - (b.volume || 0));
                } else if (sortBy === 'liquidity_high') {
                    eventsWithStats.sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0));
                }

                // Apply limit after filtering and sorting
                eventsWithStats = eventsWithStats.slice(0, limit);

                return {
                    data: eventsWithStats,
                    pagination: {
                        limit,
                        offset,
                        total: totalCount,
                        hasMore: offset + limit < totalCount
                    }
                };
            },
            { ttl: 600, prefix: 'events' } // 10 minutes cache
        );

        return NextResponse.json(result);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Events API failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json({
            error: 'Failed to fetch events',
            message: error instanceof Error ? error.message : String(error),
            queryTime: `${Date.now() - startTime}ms`
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { prisma } = await import('@/lib/prisma');
        const { requireAuth } = await import('@/lib/auth');

        // 1. Authentication & Authorization
        const user = await requireAuth(request as any);
        if (!user.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { title, description, resolutionDate, categories, imageUrl } = body;

        // Basic validation
        if (!title || !description || !resolutionDate) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 2. Create Event with Creator and AMM defaults
        const event = await prisma.event.create({
            data: {
                title,
                description,
                resolutionDate: new Date(resolutionDate),
                categories: categories ?? [],
                imageUrl,
                creatorId: user.id,
                // Explicitly set AMM defaults (though schema has defaults)
                liquidityParameter: 100.0,
                qYes: 0.0,
                qNo: 0.0,
                status: 'ACTIVE'
            },
            select: {
                id: true,
                title: true,
                description: true,
                categories: true,
                resolutionDate: true,
                createdAt: true,
                imageUrl: true,
                status: true
            },
        });

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Create event error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 });
    }
}

