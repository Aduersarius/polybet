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

    // Rate limiting
    const { apiLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
    const identifier = getRateLimitIdentifier(request);
    const rateLimitResponse = await checkRateLimit(apiLimiter, identifier);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id } = await params;

        // Use Redis caching with 30s TTL
        const eventWithOdds = await getOrSet(
            id,
            async () => {
                const { prisma } = await import('@/lib/prisma');

                const queryPromise = prisma.event.findUnique({
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

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Database query timeout')), 8000);
                });

                const event = await Promise.race([queryPromise, timeoutPromise]);

                if (!event) {
                    throw new Error('Event not found');
                }

                const bets = await prisma.bet.findMany({
                    where: { eventId: id },
                    select: { amount: true },
                });

                const volume = bets.reduce((sum, bet) => sum + bet.amount, 0);

                let response: any = {
                    ...event,
                    rules: (event as any).rules,
                    volume,
                    betCount: bets.length,
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
            { ttl: 10, prefix: 'event' } // Reduced to 10s for development testing
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
