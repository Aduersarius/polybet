
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

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

        // Build where clause - only filter by isHidden, show all non-hidden events regardless of status
        let where: any = { isHidden: false };

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

        // Build orderBy based on effectiveSortBy parameter
        let orderBy: any = { createdAt: 'desc' }; // default
        if (effectiveSortBy === 'newest') {
            orderBy = { createdAt: 'desc' };
        } else if (effectiveSortBy === 'ending_soon') {
            orderBy = { resolutionDate: 'asc' };
        }
        // For volume and liquidity sorting, we'll sort in JavaScript after calculating stats

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
        let eventsWithStats = events.map((event: (typeof events)[number]) => {
            const volume = volumeMap.get(event.id) ?? event.externalVolume ?? 0;
            const betCount = betCountMap.get(event.id) ?? event.externalBetCount ?? 0;

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
            } else if (event.source === 'POLYMARKET' && event.type === 'BINARY' && event.outcomes && event.outcomes.length >= 2) {
                // For Polymarket binary events without bets, use outcome probabilities
                const yesOutcome = event.outcomes.find((o: any) => /yes/i.test(o.name || ''));
                const noOutcome = event.outcomes.find((o: any) => /no/i.test(o.name || ''));
                const yesProb = yesOutcome?.probability ?? event.outcomes[0]?.probability ?? 0.5;
                const noProb = noOutcome?.probability ?? event.outcomes[1]?.probability ?? (1 - yesProb);
                // Normalize to ensure they sum to 1
                const sum = yesProb + noProb;
                yesOdds = sum > 0 ? yesProb / sum : 0.5;
                noOdds = sum > 0 ? noProb / sum : 0.5;
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
                yesOdds: Math.round(yesOdds * 100),
                noOdds: Math.round(noOdds * 100)
            };
        });

        // #region agent log
        // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         sessionId: 'debug-session',
        //         runId: 'pre-fix',
        //         hypothesisId: 'H-api-map',
        //         location: 'app/api/events/route.ts:map',
        //         message: 'mapped eventsWithStats',
        //         data: {
        //             mappedCount: eventsWithStats.length,
        //             sample: eventsWithStats[0] ? {
        //                 id: eventsWithStats[0].id,
        //                 title: eventsWithStats[0].title,
        //                 source: eventsWithStats[0].source,
        //                 categories: eventsWithStats[0].categories,
        //             } : null
        //         },
        //         timestamp: Date.now(),
        //     })
        // }).catch(() => { });
        // #endregion

        // Apply keyword-based category filtering if needed
        if (effectiveCategory && getAllCategories().includes(effectiveCategory)) {
            eventsWithStats = eventsWithStats.filter((event: (typeof eventsWithStats)[number]) => {
                const detectedCategories = categorizeEvent(event.title, event.description || '');
                return detectedCategories.includes(effectiveCategory);
            });
        }

        // Apply source filtering client-side to avoid schema drift errors
        if (source) {
            eventsWithStats = eventsWithStats.filter((event: any) => {
                if (event.source === source) return true;
                // Fallback: treat presence of polymarketId as Polymarket source
                if (source === 'POLYMARKET' && event.polymarketId) return true;
                return false;
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

        const totalCount = eventsWithStats.length;

        // Apply limit after filtering and sorting
        const paged = eventsWithStats.slice(0, limit);

        // #region agent log
        // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         sessionId: 'debug-session',
        //         runId: 'pre-fix',
        //         hypothesisId: 'H-api-results',
        //         location: 'app/api/events/route.ts:result',
        //         message: 'events api result counts',
        //         data: {
        //             category: category || 'ALL',
        //             effectiveCategory: effectiveCategory || 'ALL',
        //             timeHorizon,
        //             sortBy: effectiveSortBy,
        //             limit,
        //             offset,
        //             fetchedCount: events.length,
        //             filteredCount: eventsWithStats.length,
        //             pagedCount: paged.length
        //         },
        //         timestamp: Date.now(),
        //     })
        // }).catch(() => { });
        // #endregion

        const result = {
            data: paged,
            pagination: {
                limit,
                offset,
                total: totalCount,
                hasMore: offset + limit < totalCount,
            },
        };

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

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Create event error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 });
    }
}

