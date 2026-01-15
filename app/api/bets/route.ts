export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { validateString, validateNumber, validateEventId, validateUUID } from '@/lib/validation';
import { trackTrade, trackApiLatency, trackError, startTimer } from '@/lib/sentry-metrics';
import { checkRateLimit } from '@/lib/rate-limiter';
import { polymarketCircuit } from '@/lib/circuit-breaker';
import { hedgeAndExecute } from '@/lib/hedge-simple';

// MVP Safety Limits
const MAX_BET_AMOUNT = 1000; // $1000 max per bet for MVP
const RATE_LIMIT_BETS = 20;  // 20 bets per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

export async function POST(request: Request) {
    const startTime = Date.now();

    // Authentication check
    assertSameOrigin(request);
    const user = await requireAuth(request);

    // Rate limiting for trading
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') || 'unknown';
    const rateLimit = await checkRateLimit(user.id, ip, RATE_LIMIT_BETS, RATE_LIMIT_WINDOW);
    if (!rateLimit.allowed) {
        const status = rateLimit.reason === 'UNAVAILABLE' ? 503 : 429;
        const message = rateLimit.reason === 'UNAVAILABLE'
            ? 'Trading temporarily unavailable, please try again later'
            : 'Too many trades. Please wait a moment before placing another bet.';
        trackError('trading', 'rate_limit_exceeded');
        return createClientErrorResponse(message, status);
    }

    try {
        const body = await request.json();

        // Validate inputs
        const eventIdResult = validateEventId(body.eventId, true);
        if (!eventIdResult.valid) {
            return createClientErrorResponse(`eventId: ${eventIdResult.error}`, 400);
        }

        const optionResult = validateString(body.option || body.outcome, {
            required: true,
            pattern: /^(YES|NO)$/i
        });
        if (!optionResult.valid) {
            return createClientErrorResponse(`option: ${optionResult.error || 'must be "YES" or "NO"'}`, 400);
        }

        const amountResult = validateNumber(body.amount, {
            required: true,
            min: 0.01,
            max: MAX_BET_AMOUNT
        });
        if (!amountResult.valid) {
            return createClientErrorResponse(`amount: ${amountResult.error}`, 400);
        }

        const targetUserId = user.id;
        const eventId = eventIdResult.sanitized!;
        const option = optionResult.sanitized!.toUpperCase() as 'YES' | 'NO';
        const numericAmount = amountResult.sanitized!;

        const eventMeta = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, source: true, polymarketId: true, type: true },
        });
        if (!eventMeta) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        let matchedOutcome = null;
        if (body.outcomeId) {
            const outcomeIdResult = validateUUID(body.outcomeId);
            if (outcomeIdResult.valid) {
                matchedOutcome = await prisma.outcome.findUnique({
                    where: { id: outcomeIdResult.sanitized!, eventId },
                    select: { id: true, polymarketOutcomeId: true },
                });
            }
        }

        if (!matchedOutcome) {
            matchedOutcome = await prisma.outcome.findFirst({
                where: { eventId, name: { equals: option, mode: 'insensitive' } },
                select: { id: true, polymarketOutcomeId: true },
            });
        }

        // PHASE 1: Circuit Breaker Pre-Check
        // Prevent bets on Polymarket events if hedging is unavailable
        if (eventMeta.source === 'POLYMARKET') {
            if (!polymarketCircuit.isAllowed()) {
                trackError('hedging', 'circuit_breaker_open');
                return createClientErrorResponse(
                    'Polymarket trading temporarily unavailable. Please try again in a few moments.',
                    503
                );
            }
        }

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
                            source: true,
                            polymarketId: true,
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
                    numericAmount,
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
                const [upsertedUser, updatedEvent, newBet, orderRecord] = await withTimeout(
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
                                amount: numericAmount,
                                option,
                                userId: targetUserId,
                                eventId,
                                type: 'BET',
                                price: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
                                isAmmInteraction: true
                            }
                        }),
                        prisma.order.create({
                            data: {
                                userId: targetUserId,
                                eventId,
                                outcomeId: matchedOutcome?.id || null,
                                option,
                                side: option === 'YES' ? 'buy' : 'sell',
                                price: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
                                amount: numericAmount,
                                amountFilled: numericAmount,
                                status: 'filled',
                                orderType: 'market',
                            },
                        })
                    ]) as Promise<[any, any, any, any]>,
                    8000 // 8 second timeout for transaction
                );

                return { user, updatedEvent, newBet, tokensReceived, newOdds, orderRecord };
            },
            { timeout: 10000 } // 10 second queue timeout
        );

        const { newBet, tokensReceived, newOdds, orderRecord } = result;

        // PHASE 1: Smart Position-Aware Hedging
        // Detect if user is closing existing position → close hedge
        // Or opening new position → create new hedge
        if (eventMeta.source === 'POLYMARKET' && orderRecord?.id) {
            try {
                // Check user's net position BEFORE this bet
                const userPositions = await prisma.order.groupBy({
                    by: ['option'],
                    where: {
                        userId: targetUserId,
                        eventId,
                        status: 'filled',
                        id: { not: orderRecord.id }, // Exclude current order
                    },
                    _sum: {
                        amountFilled: true,
                    },
                });

                const yesPosition = userPositions.find(p => p.option === 'YES')?._sum.amountFilled || 0;
                const noPosition = userPositions.find(p => p.option === 'NO')?._sum.amountFilled || 0;
                const netYesPosition = yesPosition - noPosition;

                console.log(`[Hedging] User position before bet: YES=${netYesPosition.toFixed(2)}, current bet: ${option} $${numericAmount}`);

                // Determine if this closes an existing position
                const isClosing = (
                    (option === 'NO' && netYesPosition > 0) || // Selling YES by buying NO
                    (option === 'YES' && netYesPosition < 0)    // Selling NO by buying YES
                );

                if (isClosing) {
                    // User is closing their position - close the hedge on Polymarket
                    console.log('[Hedging] 🔄 Position close detected - closing existing hedge');

                    const { closeHedgePosition } = await import('@/lib/hedge-simple');
                    const closeResult = await closeHedgePosition({
                        userId: targetUserId,
                        eventId,
                        option: option as 'YES' | 'NO',
                        amount: numericAmount,
                        userOrderId: orderRecord.id,
                    });

                    if (!closeResult.success) {
                        console.error('[Hedging] Failed to close hedge:', closeResult.error);
                        trackError('hedging', 'hedge_close_failed');
                        // Don't fail the user's trade - they closed their position successfully
                        // The hedge close failure is our problem to handle manually
                    } else {
                        console.log(`[Hedging] ✅ Hedge closed - P/L: $${closeResult.realizedPnL?.toFixed(4)}`);
                    }
                } else {
                    // User is opening new position - normal hedge
                    console.log('[Hedging] 📈 New position detected - opening hedge');

                    const hedgeResult = await hedgeAndExecute({
                        userId: targetUserId,
                        eventId,
                        option: option as 'YES' | 'NO',
                        amount: numericAmount,
                    }, {
                        skipUserTrade: true  // AMM already created the order
                    });

                    if (!hedgeResult.success) {
                        console.error('[Hedging] CRITICAL: Hedge failed after AMM committed:', {
                            orderId: orderRecord.id,
                            error: hedgeResult.error,
                            errorCode: hedgeResult.errorCode
                        });
                        trackError('hedging', 'hedge_failed_after_commit');

                        return createClientErrorResponse(
                            'Unable to complete bet placement. Please contact support if amount was deducted.',
                            503
                        );
                    }

                    console.log(`[Hedging] ✅ Hedge opened - Profit: $${hedgeResult.netProfit?.toFixed(4)}, PM Order: ${hedgeResult.polymarketOrderId}`);
                }
            } catch (err) {
                console.error('[Hedging] CRITICAL Exception:', err);
                trackError('hedging', 'hedge_exception');
                return createClientErrorResponse(
                    'Unable to complete bet placement. Please contact support if amount was deducted.',
                    503
                );
            }
        }

        // 4. Publish to Pusher for Real-time Updates (non-blocking)
        (async () => {
            try {
                const { getPusherServer, triggerUserUpdate } = await import('@/lib/pusher-server');
                const pusherServer = getPusherServer();

                await pusherServer.trigger(`event-${eventId}`, 'odds-update', {
                    eventId,
                    timestamp: Math.floor(Date.now() / 1000),
                    yesPrice: newOdds.yesPrice,
                    volume: numericAmount
                });

                await triggerUserUpdate(targetUserId, 'user-update', {
                    type: 'POSITION_UPDATE',
                    payload: { eventId }
                });
            } catch (err) {
                console.error('[Pusher] Broadcast failed:', err);
            }
        })();

        const totalTime = Date.now() - startTime;
        console.log(`✅ Trade executed: ${option} $${numericAmount} → ${tokensReceived.toFixed(2)} tokens. New Price: ${newOdds.yesPrice.toFixed(2)} (${totalTime}ms)`);

        // Track trade metrics in Sentry
        trackTrade(
            'buy',
            option.toLowerCase() as 'yes' | 'no',
            numericAmount,
            eventMeta.type === 'BINARY' ? 'binary' : eventMeta.type === 'GROUPED' ? 'grouped' : 'multiple'
        );
        trackApiLatency('/api/bets', totalTime, 200);

        // 5. Minimal cache invalidation + WebSocket publish (non-blocking)
        // Fire and forget to avoid blocking the response
        // Note: For sports events (Polymarket), the SSE stream at /api/sports/live/stream
        // will automatically pick up this bet within 3 seconds and recalculate hybrid odds
        Promise.all([
            (async () => {
                await redis.del(`event:${eventId}`).catch(() => { });
                await redis.del(`event:amm:${eventId}`).catch(() => { });
            })()
        ]).catch(err => console.error('Post-bet cleanup failed:', err));


        // 6. Return Result
        return NextResponse.json({
            success: true,
            betId: newBet.id,
            orderId: orderRecord?.id,
            tokensReceived,
            priceAtTrade: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
            newYesPrice: newOdds.yesPrice,
            newNoPrice: newOdds.noPrice
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        // Track error metrics
        trackError('trading', error instanceof Error ? error.message : 'unknown');
        trackApiLatency('/api/bets', totalTime, error instanceof Error && error.message === 'Query timeout' ? 504 : 500);

        // Return 504 for timeouts, 500 for other errors
        if (error instanceof Error && error.message === 'Query timeout') {
            return createClientErrorResponse('Request timed out', 504);
        }
        return createErrorResponse(error);
    }
}
