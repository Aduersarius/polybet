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

        // 5. Trigger hedging for Polymarket-backed events (fire-and-forget)
        if (eventMeta.source === 'POLYMARKET' && orderRecord?.id) {
            (async () => {
                try {
                    const { hedgeUserOrder } = await import('@/lib/hedging/per-order');
                    await hedgeUserOrder({
                        orderId: orderRecord.id,
                        eventId,
                        option: option as 'YES' | 'NO',
                        amount: numericAmount,
                        price: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
                        userId: targetUserId,
                        polymarketOutcomeId: matchedOutcome?.polymarketOutcomeId || undefined,
                    });
                } catch (err) {
                    console.error('[Hedging] Failed to trigger per-order hedge', err);
                }
            })();
        }

        // 4. Publish to Redis for Real-time Updates (non-blocking)
        if (redis) {
            const updatePayload = {
                eventId,
                timestamp: Math.floor(Date.now() / 1000),
                yesPrice: newOdds.yesPrice,
                volume: numericAmount
            };
            // Don't await - fire and forget for better performance
            redis.publish('event-updates', JSON.stringify(updatePayload)).catch(err =>
                console.error('Redis publish failed:', err)
            );
        }

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
                if (redis && (redis as any).status === 'ready') {
                    await redis.del(`event:${eventId}`).catch(() => { });
                    await redis.del(`event:amm:${eventId}`).catch(() => { });

                    const updatePayload = {
                        eventId,
                        timestamp: Math.floor(Date.now() / 1000),
                        yesPrice: newOdds.yesPrice,
                        volume: numericAmount
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
