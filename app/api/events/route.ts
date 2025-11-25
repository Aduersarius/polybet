
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 15; // 15 second timeout for Vercel

export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Cap at 100
    const offset = parseInt(searchParams.get('offset') || '0');

    // Rate limiting with IP bypass for 185.72.224.35
    const { apiLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
    const identifier = getRateLimitIdentifier(request);
    const rateLimitResponse = await checkRateLimit(apiLimiter, identifier);
    if (rateLimitResponse) return rateLimitResponse;

    // Debug logging
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    console.log('Environment check:', {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlLength: process.env.DATABASE_URL?.length
    });

    try {
        const { getOrSet } = await import('@/lib/cache');
        const cacheKey = category
            ? `all:${category}:${limit}:${offset}`
            : `all:${limit}:${offset}`;

        // Use Redis caching with 600s TTL (10 minutes)
        const result = await getOrSet(
            cacheKey,
            async () => {
                const { prisma } = await import('@/lib/prisma');
                const where = category ? { categories: { has: category } } : {};

                // Use a single transaction to reduce connection usage
                const result = await prisma.$transaction(async (tx) => {
                    // Get total count
                    const totalCount = await tx.event.count({
                        where: {
                            ...where,
                            status: 'ACTIVE'
                        }
                    });

                    // Get events with bets
                    const events = await tx.event.findMany({
                        where: {
                            ...where,
                            status: 'ACTIVE'
                        },
                        orderBy: { createdAt: 'desc' },
                        select: {
                            id: true,
                            title: true,
                            categories: true,
                            resolutionDate: true,
                            imageUrl: true,
                            createdAt: true,
                            qYes: true,
                            qNo: true,
                            liquidityParameter: true,
                            bets: {
                                select: {
                                    amount: true,
                                    option: true
                                }
                            }
                        },
                        take: limit,
                        skip: offset,
                    });

                    return { events, totalCount };
                });

                const { events, totalCount } = result;

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

                const eventsWithStats = events.map(event => {
                    const volume = event.bets.reduce((sum: number, bet: any) => sum + bet.amount, 0);
                    const betCount = event.bets.length;

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

                    const { bets, qYes: _, qNo: __, liquidityParameter: ___, ...eventData } = event; // Remove bets and AMM state from response
                    return {
                        ...eventData,
                        volume,
                        betCount,
                        yesOdds,
                        noOdds
                    };
                });

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
        const { auth } = await import('@clerk/nextjs/server');
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { prisma } = await import('@/lib/prisma');
        const body = await request.json();
        const { title, description, resolutionDate, categories } = body;

        // Basic validation
        if (!title || !description || !resolutionDate) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Get or create user with Clerk ID
        let user = await prisma.user.findUnique({ where: { clerkId: userId } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    clerkId: userId,
                    // Clerk will provide additional user data if needed
                }
            });
        }

        const event = await prisma.event.create({
            data: {
                title,
                description,
                resolutionDate: new Date(resolutionDate),
                creatorId: user.id,
                categories: categories ?? [],
            },
            select: {
                id: true,
                title: true,
                description: true,
                categories: true,
                resolutionDate: true,
                createdAt: true,
                imageUrl: true,
            },
        });

        return NextResponse.json(event);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
}

