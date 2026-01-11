
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { calculateDisplayVolume } from '@/lib/volume-scaler';
import { getOrSet } from '@/lib/cache';
import { redis } from '@/lib/redis';

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
    const source = searchParams.get('source'); // optional source filter (e.g., POLYMARKET)
    const searchQuery = searchParams.get('search')?.trim();

    // Generate cache key from query params (skip caching for user-specific/search queries)
    const isCacheable = category !== 'FAVORITES' && !searchQuery;
    const cacheKey = isCacheable
        ? `events:${category || 'ALL'}:${timeHorizon}:${sortBy}:${limit}:${offset}:${source || ''}`
        : null;



    // ... (rest of the code remains the same until where clause construction)

    // #region agent log
    // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //         sessionId: 'debug-session',
    //         runId: 'pre-fix',
    //         hypothesisId: 'H1',
    //         location: 'app/api/events/route.ts:17',
    //         message: 'incoming params',
    //         data: { category, timeHorizon, sortBy, limit, offset, source },
    //         timestamp: Date.now(),
    //     })
    // }).catch(() => {});
    // #endregion

    // Handle special categories
    // Normalize category name to match category-filters.ts format (e.g., 'SPORTS' -> 'Sports')
    let effectiveCategory = category;
    if (category && category !== 'ALL' && category !== 'TRENDING' && category !== 'NEW' && category !== 'FAVORITES') {
        const categoryMap: { [key: string]: string } = {
            'BUSINESS': 'Business',
            'CRYPTO': 'Crypto',
            'CULTURE': 'Culture',
            'ECONOMY': 'Economy',
            'ELECTIONS': 'Elections',
            'ESPORTS': 'Esports',
            'FINANCE': 'Finance',
            'POLITICS': 'Politics',
            'SCIENCE': 'Science',
            'SPORTS': 'Sports',
            'TECH': 'Tech',
            'WORLD': 'World',
        };
        effectiveCategory = categoryMap[category] || category;
    }
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
        const { categorizeEvent, getAllCategories, getCategoryByName } = await import('@/lib/category-filters');

        // Build where clause - only filter by isHidden, show all non-hidden events regardless of status
        let where: any = { isHidden: false };

        // 0. Source Filtering (if provided)
        if (source) {
            if (source === 'POLYMARKET') {
                where.OR = [
                    { source: 'POLYMARKET' },
                    { polymarketId: { not: null } }
                ];
            } else {
                where.source = source;
            }
        }

        // 1. Search Filtering (Top Priority / Global)
        if (searchQuery) {
            const searchFilter = {
                OR: [
                    { title: { contains: searchQuery, mode: 'insensitive' as const } },
                    { description: { contains: searchQuery, mode: 'insensitive' as const } }
                ]
            };
            if (where.OR && source === 'POLYMARKET') {
                // Special case: combine source OR with search OR
                where.AND = [
                    { OR: where.OR },
                    searchFilter
                ];
                delete where.OR;
            } else if (where.AND) {
                where.AND.push(searchFilter);
            } else {
                where.AND = [searchFilter];
            }
        }

        // 2. Category filtering (Keyword-based or Legacy)
        if (effectiveCategory && effectiveCategory !== 'ALL') {
            const catDef = getCategoryByName(effectiveCategory);
            const catFilter: any = {};

            if (catDef) {
                // DB-side Keyword Filtering
                // Sports needs special handling to include isEsports or specific categories
                if (effectiveCategory === 'Sports') {
                    catFilter.OR = [
                        { isEsports: true },
                        { categories: { has: 'Sports' } },
                        { categories: { has: 'SPORTS' } },
                        { categories: { has: 'Esports' } },
                        { categories: { has: 'ESPORTS' } },
                        ...catDef.keywords.map((kw: string) => ({
                            title: { contains: kw, mode: 'insensitive' as const }
                        })),
                        ...catDef.keywords.map((kw: string) => ({
                            description: { contains: kw, mode: 'insensitive' as const }
                        }))
                    ];
                } else {
                    catFilter.OR = [
                        { categories: { has: effectiveCategory } },
                        ...catDef.keywords.map((kw: string) => ({
                            title: { contains: kw, mode: 'insensitive' as const }
                        })),
                        ...catDef.keywords.map((kw: string) => ({
                            description: { contains: kw, mode: 'insensitive' as const }
                        }))
                    ];
                }
            } else {
                // Legacy / Exact match
                catFilter.categories = { has: effectiveCategory };
            }

            // Combine with Search if present
            if (where.AND) {
                where.AND.push(catFilter);
            } else {
                Object.assign(where, catFilter);
            }
        } else if ((!effectiveCategory || effectiveCategory === 'ALL') && category !== 'FAVORITES') {
            // When showing ALL, exclude Sports/Esports events by category array and isEsports flag only
            // No keyword matching - only explicit category assignment
            const exclusionFilter = {
                AND: [
                    { isEsports: false },
                    {
                        NOT: {
                            OR: [
                                { categories: { has: 'Sports' } },
                                { categories: { has: 'Esports' } },
                                { categories: { has: 'SPORTS' } },
                                { categories: { has: 'ESPORTS' } },
                                { categories: { has: 'sports' } },
                                { categories: { has: 'esports' } },
                            ]
                        }
                    }
                ]
            };

            if (where.AND) {
                where.AND.push(exclusionFilter);
            } else {
                Object.assign(where, exclusionFilter);
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
        } else {
            where.resolutionDate = { gte: now };
        }

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

        // 3. Sorting logic
        let orderBy: any = {};
        if (effectiveSortBy === 'newest') {
            orderBy = { createdAt: 'desc' };
        } else if (effectiveSortBy === 'oldest') {
            orderBy = { createdAt: 'asc' };
        } else if (effectiveSortBy === 'expiring') {
            orderBy = { resolutionDate: 'asc' };
        } else if (effectiveSortBy === 'volume_high') {
            orderBy = { externalVolume: 'desc' };
        } else if (effectiveSortBy === 'volume_low') {
            orderBy = { externalVolume: 'asc' };
        } else if (effectiveSortBy === 'liquidity_high') {
            orderBy = { initialLiquidity: 'desc' };
        } else {
            // Default to newest
            orderBy = { createdAt: 'desc' };
        }

        // Get events with bets

        // #region agent log
        // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         sessionId: 'debug-session',
        //         runId: 'pre-fix',
        //         hypothesisId: 'H2',
        //         location: 'app/api/events/route.ts:108',
        //         message: 'select fields and where prior to findMany',
        //         data: {
        //             whereHasSource: !!source,
        //             selectFields: ['id','title','description','categories','resolutionDate','imageUrl','createdAt','qYes','qNo','liquidityParameter','type','source','polymarketId','externalVolume','externalBetCount','outcomes'],
        //         },
        //         timestamp: Date.now(),
        //     })
        // }).catch(() => {});
        // #endregion

        const events = await prisma.event.findMany({
            where: {
                ...where
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
                isEsports: true,
                externalVolume: true,
                externalBetCount: true,
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
            take: limit + 1, // Fetch one extra to determine if there's more
            skip: offset,
        });

        const hasMore = events.length > limit;
        const pagedEvents = hasMore ? events.slice(0, limit) : events;

        // #region agent log
        // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         sessionId: 'debug-session',
        //         runId: 'pre-fix',
        //         hypothesisId: 'H-api-findMany',
        //         location: 'app/api/events/route.ts:findMany',
        //         message: 'findMany results',
        //         data: {
        //             effectiveCategory: effectiveCategory || 'ALL',
        //             whereKeys: Object.keys(where || {}),
        //             count: events.length,
        //             sampleId: events[0]?.id,
        //             sourceFilter: source || null
        //         },
        //         timestamp: Date.now(),
        //     })
        // }).catch(() => { });
        // #endregion

        // Get aggregations for volume and betCount
        const eventIds = pagedEvents.map((e: (typeof pagedEvents)[number]) => e.id);
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

        // #region agent log
        // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         sessionId: 'debug-session',
        //         runId: 'pre-fix',
        //         hypothesisId: 'H-api-activity',
        //         location: 'app/api/events/route.ts:activity',
        //         message: 'activity stats',
        //         data: {
        //             eventIdsCount: eventIds.length,
        //             activitiesCount: activities.length
        //         },
        //         timestamp: Date.now(),
        //     })
        // }).catch(() => { });
        // #endregion

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

        console.log(`✅ Events API: ${events.length} events in ${queryTime}ms`, {
            whereClause: where,
            category: effectiveCategory,
            timeHorizon,
            sortBy: effectiveSortBy
        });

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
        let eventsWithStats = pagedEvents.map((event: (typeof pagedEvents)[number]) => {
            // Apply time-based growth to external volume for proportional display
            const baseExternalVol = (event as any).externalVolume ?? 0;
            const grownExternalVol = calculateDisplayVolume(baseExternalVol, event.createdAt);
            const volume = volumeMap.get(event.id) ?? grownExternalVol;
            const betCount = betCountMap.get(event.id) ?? (event as any).externalBetCount ?? 0;

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
            } else if (event.type === 'BINARY' && event.outcomes && event.outcomes.length >= 2) {
                // For binary events with outcomes, use outcome probabilities
                const yesOutcome = event.outcomes.find((o: any) => /yes/i.test(o.name || ''));
                const noOutcome = event.outcomes.find((o: any) => /no/i.test(o.name || ''));
                const yesProb = yesOutcome?.probability ?? 0.5;
                const noProb = noOutcome?.probability ?? 0.5;
                // Normalize to ensure they sum to 1
                const sum = yesProb + noProb;
                yesOdds = sum > 0 ? yesProb / sum : 0.5;
                noOdds = sum > 0 ? noProb / sum : 0.5;
            } else {
                // Mock odds logic for demo if no bets and no outcomes
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
                yesOdds: Math.round(yesOdds * 100),
                noOdds: Math.round(noOdds * 100)
            };
        });


        const result = {
            data: eventsWithStats,
            pagination: {
                limit,
                offset,
                total: eventsWithStats.length, // This is now per-page total, ideally we'd want a global count
                hasMore,
            },
        };

        // Cache the result for 15 minutes (skip for non-cacheable requests)
        if (cacheKey && redis && (redis as any).status === 'ready') {
            try {
                await redis.setex(cacheKey, 900, JSON.stringify(result));
            } catch (e) {
                // Cache write failed, non-critical
            }
        }

        return NextResponse.json(result);
    } catch (error) {
        // #region agent log
        // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         sessionId: 'debug-session',
        //         runId: 'pre-fix',
        //         hypothesisId: 'H3',
        //         location: 'app/api/events/route.ts:307',
        //         message: 'catch block error',
        //         data: { error: error instanceof Error ? error.message : String(error) },
        //         timestamp: Date.now(),
        //     })
        // }).catch(() => {});
        // #endregion

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
        assertSameOrigin(request);
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

        // Invalidate caches
        try {
            const { invalidate, invalidatePattern } = await import('@/lib/cache');
            // Invalidate categories list in case new categories were added
            await invalidate('categories:list', 'static');
            // Invalidate "All Events" listing to show the new event
            await invalidatePattern('events:ALL:*');
            // Also invalidate NEW events
            await invalidatePattern('events:NEW:*');
        } catch (error) {
            console.warn('Failed to invalidate event cache:', error);
        }

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Create event error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 });
    }
}

