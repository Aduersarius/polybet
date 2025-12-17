import { NextRequest, NextResponse } from 'next/server';
import { calculateLMSROdds } from '@/lib/amm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const lookupByPolymarket = searchParams.get('by') === 'polymarket';

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'pre-fix',
                hypothesisId: 'H-event-entry',
                location: 'app/api/events/[id]/route.ts:entry',
                message: 'event route entry',
                data: { id, lookupByPolymarket },
                timestamp: Date.now(),
            })
        }).catch(() => { });
        // #endregion

        // Use Redis caching with longer TTL (but still low to keep freshness)
        const eventWithOdds = await getOrSet(
            `${lookupByPolymarket ? 'poly' : 'evt'}:${id}`,
            async () => {
                const { prisma } = await import('@/lib/prisma');

                const whereClause: any = lookupByPolymarket ? { polymarketId: id } : { id };

                const queryPromise = (async () => {
                    if (lookupByPolymarket) {
                        const byPoly = await prisma.event.findUnique({
                            where: { polymarketId: id },
                            include: {
                                creator: {
                                    select: {
                                        id: true,
                                        username: true,
                                        address: true,
                                    },
                                },
                                outcomes: true,
                            },
                        });

                        if (byPoly) {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    sessionId: 'debug-session',
                                    runId: 'pre-fix',
                                    hypothesisId: 'H-event-query',
                                    location: 'app/api/events/[id]/route.ts:byPoly',
                                    message: 'polymarket lookup hit',
                                    data: {
                                        id,
                                        polymarketId: byPoly?.polymarketId ?? null,
                                        eventId: byPoly?.id ?? null,
                                    },
                                    timestamp: Date.now(),
                                })
                            }).catch(() => { });
                            // #endregion
                            return byPoly;
                        }

                        // Fallback: if the caller passed our internal event id with by=polymarket, try id lookup.
                        const fallbackById = await prisma.event.findUnique({
                            where: { id },
                            include: {
                                creator: {
                                    select: {
                                        id: true,
                                        username: true,
                                        address: true,
                                    },
                                },
                                outcomes: true,
                            },
                        });

                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sessionId: 'debug-session',
                                runId: 'pre-fix',
                                hypothesisId: 'H-event-fallback',
                                location: 'app/api/events/[id]/route.ts:fallback',
                                message: 'polymarket lookup miss; fallback by id',
                                data: {
                                    id,
                                    fallbackFound: !!fallbackById,
                                    fallbackEventId: fallbackById?.id ?? null,
                                    fallbackPolymarketId: (fallbackById as any)?.polymarketId ?? null,
                                },
                                timestamp: Date.now(),
                            })
                        }).catch(() => { });
                        // #endregion

                        return fallbackById;
                    }

                    return prisma.event.findUnique({
                        where: whereClause,
                        include: {
                            creator: {
                                select: {
                                    id: true,
                                    username: true,
                                    address: true,
                                },
                            },
                            outcomes: true,
                        },
                    });
                })();

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Database query timeout')), 8000);
                });

                const event = await Promise.race([queryPromise, timeoutPromise]);

                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: 'debug-session',
                        runId: 'pre-fix',
                        hypothesisId: 'H-event-postquery',
                        location: 'app/api/events/[id]/route.ts:postQuery',
                        message: 'event query result',
                        data: {
                            id,
                            lookupByPolymarket,
                            whereClause,
                            found: !!event,
                            eventId: (event as any)?.id ?? null,
                            polymarketId: (event as any)?.polymarketId ?? null,
                            source: (event as any)?.source ?? null,
                        },
                        timestamp: Date.now(),
                    })
                }).catch(() => { });
                // #endregion

                if (!event) {
                    throw new Error('Event not found');
                }

                const [volumeRow, betCount] = await Promise.all([
                    prisma.$queryRaw<{ volume: number }[]>`
                        SELECT COALESCE(SUM("amount" * COALESCE("price", 1)), 0)::float AS volume
                        FROM "MarketActivity"
                        WHERE "eventId" = ${id} AND "type" IN ('BET', 'TRADE')
                    `,
                    prisma.marketActivity.count({
                        where: { eventId: id, type: { in: ['BET', 'TRADE'] } },
                    }),
                ]);
                const volume = volumeRow?.[0]?.volume ?? 0;

                let response: any = {
                    ...event,
                    rules: (event as any).rules,
                    volume,
                    betCount,
                };

                if ((event as any).type === 'MULTIPLE') {
                    // For multiple outcomes, calculate probabilities using LMSR
                    const { calculateMultipleLMSRProbabilities } = await import('@/lib/amm');
                    const b = (event as any).liquidityParameter || 10000.0;

                    // Create liquidity map from outcomes
                    const outcomeLiquidities = new Map<string, number>();
                    (event as any).outcomes.forEach((outcome: any) => {
                        outcomeLiquidities.set(outcome.id, outcome.liquidity || 0);
                    });

                    // Calculate current probabilities
                    const probabilities = calculateMultipleLMSRProbabilities(outcomeLiquidities, b);

                    // Add calculated odds to outcomes
                    const outcomesWithOdds = (event as any).outcomes.map((outcome: any) => {
                        const probability = probabilities.get(outcome.id) || outcome.probability || 0.5;
                        return {
                            ...outcome,
                            probability, // Set the probability field for the component
                            price: probability, // Current market price (probability)
                            odds: probability > 0 ? 1 / probability : 1,
                        };
                    });
                    response.outcomes = outcomesWithOdds;
                } else {
                    // Binary event logic
                    const qYes = (event as any).qYes || 0;
                    const qNo = (event as any).qNo || 0;
                    const b = (event as any).liquidityParameter || 10000.0;

                    let odds;
                    if (qYes === 0 && qNo === 0) {
                        // No trades yet - use 50/50 as default
                        odds = {
                            yesPrice: 0.5,
                            noPrice: 0.5,
                            yesOdds: 2.0,
                            noOdds: 2.0
                        };
                    } else {
                        // Calculate odds using actual token positions
                        const diff = (qNo - qYes) / b;
                        const yesPrice = 1 / (1 + Math.exp(diff));
                        const noPrice = 1 - yesPrice;

                        odds = {
                            yesPrice,
                            noPrice,
                            yesOdds: 1 / yesPrice,
                            noOdds: 1 / noPrice
                        };
                    }

                    response.yesOdds = odds.yesPrice;
                    response.noOdds = odds.noPrice;
                }

                return response;
            },
            { ttl: 120, prefix: 'event' }
        );

        const queryTime = Date.now() - startTime;
        console.log(`✅ Event ${(await params).id} fetched in ${queryTime}ms`);

        return NextResponse.json(eventWithOdds);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Event fetch failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json(
            { error: 'Failed to fetch event' },
            { status: 500 }
        );
    }
}
