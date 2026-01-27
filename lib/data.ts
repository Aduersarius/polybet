/**
 * Server-side data fetching utilities for SSR/RSC
 * Extracts event fetching logic for use in Server Components
 */

import { prisma } from '@/lib/prisma';
import { calculateDisplayVolume } from '@/lib/volume-scaler';
import { getCategoryByName } from '@/lib/category-filters';

interface GetEventsOptions {
    category?: string;
    timeHorizon?: 'all' | '1d' | '1w' | '1m';
    sortBy?: 'newest' | 'oldest' | 'volume_high' | 'volume_low' | 'liquidity_high' | 'ending_soon' | 'expiring';
    limit?: number;
    offset?: number;
    source?: string;
    searchQuery?: string;
}

export interface DbEvent {
    id: string;
    title: string;
    description: string;
    category: string;
    categories?: string[];
    resolutionDate: string;
    createdAt: string;
    imageUrl?: string | null;
    volume?: number;
    betCount?: number;
    yesOdds?: number;
    noOdds?: number;
    type?: string;
    source?: string;
    polymarketId?: string;
    externalVolume?: number;
    externalBetCount?: number;
    liquidity?: number;
    slug?: string | null; // Added slug
    outcomes?: Array<{
        id: string;
        name: string;
        probability: number;
        color?: string;
    }>;
}

/**
 * Fetches events for server-side rendering
 * Mirror of /api/events route logic but for RSC
 */
export async function getInitialEvents(options: GetEventsOptions = {}): Promise<{
    events: DbEvent[];
    hasMore: boolean;
}> {
    const {
        category,
        timeHorizon = 'all',
        sortBy = 'volume_high',
        limit = 20,
        offset = 0,
        source,
        searchQuery
    } = options;

    // Normalize category
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

    // Handle special categories
    if (category === 'FAVORITES') {
        // For SSR, we can't fetch favorites (requires auth)
        return { events: [], hasMore: false };
    } else if (category === 'TRENDING') {
        effectiveCategory = undefined;
        effectiveSortBy = 'volume_high';
    } else if (category === 'NEW') {
        effectiveCategory = undefined;
        effectiveSortBy = 'newest';
    }

    // Build where clause
    const where: any = { isHidden: false };

    // Source filtering
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

    // Search filtering
    if (searchQuery) {
        const searchFilter = {
            OR: [
                { title: { contains: searchQuery, mode: 'insensitive' as const } },
                { description: { contains: searchQuery, mode: 'insensitive' as const } }
            ]
        };
        if (where.OR && source === 'POLYMARKET') {
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

    // Category filtering
    if (effectiveCategory && effectiveCategory !== 'ALL') {
        const catDef = getCategoryByName(effectiveCategory);
        const catFilter: any = {};

        if (catDef) {
            // DB-side Tag Filtering
            if (effectiveCategory === 'Sports') {
                catFilter.OR = [
                    { isEsports: true },
                    { categories: { has: 'Sports' } },
                    { categories: { has: 'SPORTS' } },
                    { categories: { has: 'Esports' } },
                    { categories: { has: 'ESPORTS' } },
                ];
            } else {
                // Precise tag matching (case-sensitive as per DB storage, but mapped from frontend)
                catFilter.categories = { has: effectiveCategory };
            }
        } else {
            // Legacy / Exact match
            catFilter.categories = { has: effectiveCategory };
        }

        if (where.AND) {
            where.AND.push(catFilter);
        } else {
            Object.assign(where, catFilter);
        }
    } else if ((!effectiveCategory || effectiveCategory === 'ALL') && category !== 'FAVORITES') {
        // Exclude Sports/Esports from ALL
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

    // Sorting
    let orderBy: any = {};
    if (effectiveSortBy === 'newest') {
        orderBy = { createdAt: 'desc' };
    } else if (effectiveSortBy === 'oldest') {
        orderBy = { createdAt: 'asc' };
    } else if (effectiveSortBy === 'expiring' || effectiveSortBy === 'ending_soon') {
        orderBy = { resolutionDate: 'asc' };
    } else if (effectiveSortBy === 'volume_high') {
        orderBy = { externalVolume: 'desc' };
    } else if (effectiveSortBy === 'volume_low') {
        orderBy = { externalVolume: 'asc' };
    } else if (effectiveSortBy === 'liquidity_high') {
        orderBy = { initialLiquidity: 'desc' };
    } else {
        orderBy = { createdAt: 'desc' };
    }

    // Fetch events
    const events = await prisma.event.findMany({
        where,
        orderBy,
        select: {
            id: true,
            title: true,
            description: true,
            slug: true, // ADDED
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
        take: limit + 1,
        skip: offset,
    });

    const hasMore = events.length > limit;
    const pagedEvents = hasMore ? events.slice(0, limit) : events;

    // Get activity stats
    const eventIds = pagedEvents.map((e: any) => e.id);
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
        const vol = activity.amount * (activity.price ?? 1);
        const currentVol = volumeMap.get(activity.eventId) || 0;
        volumeMap.set(activity.eventId, currentVol + vol);

        const currentCount = betCountMap.get(activity.eventId) || 0;
        betCountMap.set(activity.eventId, currentCount + 1);
    }

    // Process events with stats
    const eventsWithStats: DbEvent[] = pagedEvents.map((event: any) => {
        const baseExternalVol = event.externalVolume ?? 0;
        const grownExternalVol = calculateDisplayVolume(baseExternalVol, event.createdAt);
        const volume = volumeMap.get(event.id) ?? grownExternalVol;
        const betCount = betCountMap.get(event.id) ?? event.externalBetCount ?? 0;

        // Calculate liquidity
        let liquidity = 0;
        if (event.type === 'MULTIPLE') {
            liquidity = event.outcomes?.reduce((sum: number, outcome: any) => sum + (outcome.liquidity || 0), 0) || 0;
        } else {
            liquidity = (event.qYes || 0) + (event.qNo || 0);
        }

        // Calculate odds
        let yesOdds = 0.5;
        let noOdds = 0.5;

        const qYes = event.qYes || 0;
        const qNo = event.qNo || 0;
        const b = event.liquidityParameter || 10000.0;

        if (qYes > 0 || qNo > 0) {
            const diff = (qNo - qYes) / b;
            const yesPrice = 1 / (1 + Math.exp(diff));
            yesOdds = yesPrice;
            noOdds = 1 - yesOdds;
        } else if (event.type === 'BINARY' && event.outcomes && event.outcomes.length >= 2) {
            const yesOutcome = event.outcomes.find((o: any) => /yes/i.test(o.name || ''));
            const noOutcome = event.outcomes.find((o: any) => /no/i.test(o.name || ''));
            const yesProb = yesOutcome?.probability ?? 0.5;
            const noProb = noOutcome?.probability ?? 0.5;
            const sum = yesProb + noProb;
            yesOdds = sum > 0 ? yesProb / sum : 0.5;
            noOdds = sum > 0 ? noProb / sum : 0.5;
        } else {
            // Mock odds
            const mockScenarios = [
                { yes: 0.60 }, { yes: 0.40 }, { yes: 0.70 }, { yes: 0.30 }, { yes: 0.50 },
                { yes: 0.75 }, { yes: 0.25 }, { yes: 0.55 }, { yes: 0.45 }, { yes: 0.65 }
            ];
            const scenarioIndex = event.id.split('').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0) % mockScenarios.length;
            yesOdds = mockScenarios[scenarioIndex].yes;
            noOdds = 1 - yesOdds;
        }

        return {
            id: event.id,
            title: event.title,
            description: event.description,
            category: event.categories?.[0] || 'General',
            categories: event.categories,
            resolutionDate: event.resolutionDate.toISOString(),
            createdAt: event.createdAt.toISOString(),
            imageUrl: event.imageUrl,
            volume,
            betCount,
            liquidity,
            yesOdds: Math.round(yesOdds * 100),
            noOdds: Math.round(noOdds * 100),
            type: event.type,
            slug: event.slug, // ADDED
            outcomes: event.outcomes?.map((o: any) => ({
                id: o.id,
                name: o.name,
                probability: o.probability,
                color: o.color || undefined
            }))
        };
    });

    return {
        events: eventsWithStats,
        hasMore
    };
}

/**
 * Gets a single event by ID (for event detail pages)
 */
export async function getEventById(id: string): Promise<DbEvent | null> {
    const event = await prisma.event.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            description: true,
            slug: true, // ADDED
            categories: true,
            resolutionDate: true,
            imageUrl: true,
            createdAt: true,
            qYes: true,
            qNo: true,
            liquidityParameter: true,
            type: true,
            externalVolume: true,
            externalBetCount: true,
            outcomes: {
                select: {
                    id: true,
                    name: true,
                    probability: true,
                    color: true,
                    liquidity: true
                }
            }
        }
    });

    if (!event) return null;

    // Calculate stats (similar to above)
    const activities = await prisma.marketActivity.findMany({
        where: {
            eventId: id,
            type: { in: ['BET', 'TRADE'] }
        },
        select: {
            amount: true,
            price: true
        }
    });

    let volume = 0;
    for (const activity of activities) {
        volume += activity.amount * (activity.price ?? 1);
    }

    const betCount = activities.length;

    let liquidity = 0;
    if (event.type === 'MULTIPLE') {
        liquidity = event.outcomes?.reduce((sum: number, outcome: any) => sum + (outcome.liquidity || 0), 0) || 0;
    } else {
        liquidity = (event.qYes || 0) + (event.qNo || 0);
    }

    // Calculate odds (same logic as above)
    let yesOdds = 0.5;
    let noOdds = 0.5;
    const qYes = event.qYes || 0;
    const qNo = event.qNo || 0;
    const b = event.liquidityParameter || 10000.0;

    if (qYes > 0 || qNo > 0) {
        const diff = (qNo - qYes) / b;
        const yesPrice = 1 / (1 + Math.exp(diff));
        yesOdds = yesPrice;
        noOdds = 1 - yesOdds;
    }

    return {
        id: event.id,
        title: event.title,
        description: event.description,
        slug: event.slug, // ADDED
        category: event.categories?.[0] || 'General',
        categories: event.categories,
        resolutionDate: event.resolutionDate.toISOString(),
        createdAt: event.createdAt.toISOString(),
        imageUrl: event.imageUrl,
        volume,
        betCount,
        liquidity,
        yesOdds: Math.round(yesOdds * 100),
        noOdds: Math.round(noOdds * 100),
        type: event.type,
        outcomes: event.outcomes?.map((o: any) => ({
            id: o.id,
            name: o.name,
            probability: o.probability,
            color: o.color || undefined
        }))
    };
}
