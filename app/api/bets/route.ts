export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';
import { requireAuth } from '@/lib/auth';

export async function POST(request: Request) {
    const startTime = Date.now();

    // Authentication check
    const user = await requireAuth(request);

    try {
        const body = await request.json();
        // Support both 'option' (from generate-trades) and 'outcome' (from TradingPanel)
        const { eventId, amount } = body;
        const option = body.option || body.outcome;

        if (!eventId || !option || !amount) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const targetUserId = user.id;

        // Helper for query timeout protection
        const withTimeout = <T>(promise: Promise<T>, ms: number = 3000): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Query timeout')), ms)
                )
            ]);
        };

        // PHASE 2.5: Use request queuing to serialize bets on the same event
        // This prevents concurrent AMM state updates and race conditions
        const { RequestQueue } = await import('@/lib/queue');

        const result = await RequestQueue.enqueue(
            `bet:${eventId}`, // Queue key per event
            async () => {
                // 1. Fetch FRESH Event State (no stale cache for AMM)
                // CRITICAL: Always get latest AMM state to prevent race conditions
                const event = await withTimeout(
                    prisma.event.findUnique({
                        where: { id: eventId },
                        select: {
                            id: true,
                            liquidityParameter: true,
                            qYes: true,
                            qNo: true,
                            status: true,
                        }
                    }),
                    3000 // 3 second timeout for single record
                ) as any;

                if (!event) {
                    throw new Error('Event not found');
                }

                // 2. Run AMM Math
                const b = event.liquidityParameter || 10000;
                const currentQYes = event.qYes || 0;
                const currentQNo = event.qNo || 0;

                // Calculate tokens received for this amount
                const tokensReceived = calculateTokensForCost(
                    currentQYes,
                    currentQNo,
                    parseFloat(amount),
                    option as 'YES' | 'NO',
                    b
                );

                // Calculate new state
                const newQYes = option === 'YES' ? currentQYes + tokensReceived : currentQYes;
                const newQNo = option === 'NO' ? currentQNo + tokensReceived : currentQNo;

                // Calculate new odds
                const newOdds = calculateLMSROdds(newQYes, newQNo, b);

                // 3. Atomic User Upsert + Bet Transaction
                // OPTIMIZATION: Use upsert to find-or-create user in 1 query instead of 2-3
                const [upsertedUser, updatedEvent, newBet] = await withTimeout(
                    prisma.$transaction([
                        prisma.user.upsert({
                            where: { id: targetUserId },
                            update: {}, // No updates needed if user exists
                            create: {
                                id: targetUserId,
                                username: user.name || `User_${targetUserId.slice(-8)}`,
                                email: user.email,
                                address: `0x${targetUserId.slice(-8)}`
                            }
                        }),
                        prisma.event.update({
                            where: { id: eventId },
                            data: {
                                qYes: newQYes,
                                qNo: newQNo,
                                yesOdds: newOdds.yesPrice,
                                noOdds: newOdds.noPrice
                            }
                        }),
                        (prisma as any).marketActivity.create({
                            data: {
                                amount: parseFloat(amount),
                                option,
                                userId: targetUserId,
                                eventId,
                                type: 'BET',
                                price: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
                                isAmmInteraction: true
                            }
                        })
                    ]) as Promise<[any, any, any]>,
                    8000 // 8 second timeout for transaction
                );

                return { user, updatedEvent, newBet, tokensReceived, newOdds };
            },
            { timeout: 10000 } // 10 second queue timeout
        );

        const { newBet, tokensReceived, newOdds } = result;

        // 4. Publish to Redis for Real-time Updates (non-blocking)
        if (redis) {
            const updatePayload = {
                eventId,
                timestamp: Math.floor(Date.now() / 1000),
                yesPrice: newOdds.yesPrice,
                volume: parseFloat(amount)
            };
            // Don't await - fire and forget for better performance
            redis.publish('event-updates', JSON.stringify(updatePayload)).catch(err =>
                console.error('Redis publish failed:', err)
            );
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Trade executed: ${option} $${amount} → ${tokensReceived.toFixed(2)} tokens. New Price: ${newOdds.yesPrice.toFixed(2)} (${totalTime}ms)`);

        // 5. Minimal cache invalidation + WebSocket publish (non-blocking)
        // Fire and forget to avoid blocking the response
        Promise.all([
            (async () => {
                if (redis) {
                    await redis.del(`event:${eventId}`).catch(e => console.error('Cache del failed:', e));
                    await redis.del(`event:amm:${eventId}`).catch(e => console.error('Cache del failed:', e));

                    const updatePayload = {
                        eventId,
                        timestamp: Math.floor(Date.now() / 1000),
                        yesPrice: newOdds.yesPrice,
                        volume: parseFloat(amount)
                    };
                    await redis.publish('event-updates', JSON.stringify(updatePayload))
                        .catch(e => console.error('Redis publish failed:', e));
                }
            })()
        ]).catch(err => console.error('Post-bet cleanup failed:', err));


        // 6. Return Result
        return NextResponse.json({
            success: true,
            betId: newBet.id,
            tokensReceived,
            priceAtTrade: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
            newYesPrice: newOdds.yesPrice,
            newNoPrice: newOdds.noPrice
        });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Trade failed after ${errorTime}ms:`, error);

        // Return 504 for timeouts, 500 for other errors
        const status = (error as Error).message === 'Query timeout' ? 504 : 500;
        return NextResponse.json({
            error: 'Failed to place bet',
            details: status === 504 ? 'Request timed out' : undefined
        }, { status });
    }
}
