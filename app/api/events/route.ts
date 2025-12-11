
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

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

    // Handle special categories
    let effectiveCategory = category;
    let effectiveSortBy = sortBy;
    let user = null;

    if (category === 'FAVORITES') {
        // Get authenticated user for favorites
        user = await requireAuth(request as any).catch(() => null);
        if (!user) {
            return NextResponse.json({
                data: [],
                pagination: {
                    limit,
                    offset,
                    total: 0,
                    hasMore: false
                }
            });
        }

        effectiveCategory = null; // No category filtering for favorites
        // We'll filter by user's favorites in the query
    } else if (category === 'TRENDING') {
        effectiveCategory = null; // No category filtering for trending
        effectiveSortBy = 'volume_high';
    } else if (category === 'NEW') {
        effectiveCategory = null; // No category filtering for new
        effectiveSortBy = 'newest';
    }

    // Production-ready: minimal logging

    try {
        const { prisma } = await import('@/lib/prisma');
        const { categorizeEvent, getAllCategories } = await import('@/lib/category-filters');

        // Build where clause
        let where: any = { isHidden: false, status: 'ACTIVE' };

        // Category filtering
        if (effectiveCategory && effectiveCategory !== 'ALL') {
            if (getAllCategories().includes(effectiveCategory)) {
                // Use keyword-based filtering for our defined categories
                // Fetch all events, filter by keywords in JavaScript
            } else {
                // Legacy category filtering
                where.categories = { has: effectiveCategory };
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

        // Favorites filtering (outside transaction to avoid long TX)
        if (category === 'FAVORITES' && user) {
            const favoriteEventIds = await prisma.userFavorite.findMany({
                where: { userId: user.id },
                select: { eventId: true }
            });
            const eventIds = favoriteEventIds.map((fav: any) => fav.eventId);
            if (eventIds.length === 0) {
                return NextResponse.json({
                    data: [],
                    pagination: {
                        limit,
                        offset,
                        total: 0,
                        hasMore: false,
                    },
                });
            }
            where.id = { in: eventIds };
        }

        // Get total count
        const totalCount = await prisma.event.count({
            where: {
                ...where,
                status: 'ACTIVE'
            }
        });

        // Build orderBy based on effectiveSortBy parameter
        let orderBy: any = { createdAt: 'desc' }; // default
        if (effectiveSortBy === 'newest') {
            orderBy = { createdAt: 'desc' };
        } else if (effectiveSortBy === 'ending_soon') {
            orderBy = { resolutionDate: 'asc' };
        }
        // For volume and liquidity sorting, we'll sort in JavaScript after calculating stats

        // Get events with bets
        const events = await prisma.event.findMany({
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
        const eventIds = events.map((e: (typeof events)[number]) => e.id);
        const activities = eventIds.length
            ? await prisma.marketActivity.findMany({
                where: {
                    eventId: { in: eventIds },
                    type: { in: ['BET', 'TRADE'] }
                },
                select: {
                    eventId: true,
                    amount: true,
                    price: true
                }
            })
            : [];

        const volumeMap = new Map<string, number>();
        const betCountMap = new Map<string, number>();

        for (const activity of activities) {
            // Volume
            const vol = activity.amount * (activity.price ?? 1);
            const currentVol = volumeMap.get(activity.eventId) || 0;
            volumeMap.set(activity.eventId, currentVol + vol);

            // Bet Count
            const currentCount = betCountMap.get(activity.eventId) || 0;
            betCountMap.set(activity.eventId, currentCount + 1);
        }

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
        let eventsWithStats = events.map((event: (typeof events)[number]) => {
            const volume = volumeMap.get(event.id) || 0;
            const betCount = betCountMap.get(event.id) || 0;

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
        if (effectiveCategory && getAllCategories().includes(effectiveCategory)) {
            eventsWithStats = eventsWithStats.filter((event: (typeof eventsWithStats)[number]) => {
                const detectedCategories = categorizeEvent(event.title, event.description || '');
                return detectedCategories.includes(effectiveCategory);
            });
        }

        // Apply volume/liquidity sorting
        if (effectiveSortBy === 'volume_high') {
            eventsWithStats.sort(
                (a: (typeof eventsWithStats)[number], b: (typeof eventsWithStats)[number]) =>
                    (b.volume || 0) - (a.volume || 0)
            );
        } else if (effectiveSortBy === 'volume_low') {
            eventsWithStats.sort(
                (a: (typeof eventsWithStats)[number], b: (typeof eventsWithStats)[number]) =>
                    (a.volume || 0) - (b.volume || 0)
            );
        } else if (effectiveSortBy === 'liquidity_high') {
            eventsWithStats.sort(
                (a: (typeof eventsWithStats)[number], b: (typeof eventsWithStats)[number]) =>
                    (b.liquidity || 0) - (a.liquidity || 0)
            );
        }

        // Apply limit after filtering and sorting
        eventsWithStats = eventsWithStats.slice(0, limit);

        const result = {
            data: eventsWithStats,
            pagination: {
                limit,
                offset,
                total: totalCount,
                hasMore: offset + limit < totalCount,
            },
        };

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
        const { title, description, resolutionDate, categories, imageUrl, type = 'BINARY', outcomes = [], isHidden = false } = body;

        // Basic validation
        if (!title || !description || !resolutionDate) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!['BINARY', 'MULTIPLE'].includes(type)) {
            return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
        }

        const parsedOutcomes = Array.isArray(outcomes)
            ? outcomes.filter((o: any) => o?.name).map((o: any) => ({
                name: o.name,
                probability: o.probability ?? 0.5,
                liquidity: o.liquidity ?? 0,
            }))
            : [];

        if (type === 'MULTIPLE' && parsedOutcomes.length < 2) {
            return NextResponse.json({ error: 'Please provide at least two outcomes' }, { status: 400 });
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
                isHidden: Boolean(isHidden),
                type,
                // Explicitly set AMM defaults (though schema has defaults)
                liquidityParameter: type === 'MULTIPLE' ? 10000.0 : 20000.0,
                qYes: 0.0,
                qNo: 0.0,
                status: 'ACTIVE',
                outcomes: type === 'MULTIPLE' && parsedOutcomes.length > 0
                    ? {
                        create: parsedOutcomes
                    }
                    : undefined,
            },
            select: {
                id: true,
                title: true,
                description: true,
                categories: true,
                resolutionDate: true,
                createdAt: true,
                imageUrl: true,
                status: true,
                type: true,
                isHidden: true,
                outcomes: true,
            },
        });

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Create event error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 });
    }
}

