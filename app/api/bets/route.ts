export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { trackTrade, trackApiLatency, trackError } from '@/lib/metrics';
import { checkRateLimit } from '@/lib/rate-limiter';
import { polymarketCircuit } from '@/lib/circuit-breaker';

// MVP Safety Limits
const MAX_BET_AMOUNT = 1000; // $1000 max per bet for MVP
const RATE_LIMIT_BETS = 20;  // 20 bets per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

const BetRequestSchema = z.object({
    eventId: z.string().min(1),
    option: z.enum(['YES', 'NO', 'yes', 'no', 'Yes', 'No']).transform(v => v.toUpperCase() as 'YES' | 'NO'),
    amount: z.coerce.number().min(0.01).max(MAX_BET_AMOUNT),
    outcomeId: z.string().uuid().optional(),
});

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

        // Validate inputs using Zod
        const parsed = BetRequestSchema.safeParse(body);
        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            return createClientErrorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
        }

        const { eventId, option, amount: numericAmount, outcomeId: validatedOutcomeId } = parsed.data;
        const targetUserId = user.id;

        const eventMeta = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, source: true, polymarketId: true, type: true },
        });
        if (!eventMeta) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        let matchedOutcome = null;
        if (validatedOutcomeId) {
            matchedOutcome = await prisma.outcome.findUnique({
                where: { id: validatedOutcomeId, eventId },
                select: { id: true, polymarketOutcomeId: true },
            });
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
                trackError('trading', 'circuit_breaker_open');
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

        // PHASE 1: Route via Orchestrator
        if (eventMeta.source === 'POLYMARKET') {
            const { OrderOrchestrator } = await import('@/lib/order-orchestrator');

            const result = await OrderOrchestrator.processOrder({
                userId: targetUserId,
                eventId,
                option,
                amount: numericAmount,
            });

            if (!result.success) {
                return createClientErrorResponse(result.error || 'Trade failed', 400);
            }

            // Publish to Pusher for Real-time Updates (non-blocking)
            (async () => {
                try {
                    const { getPusherServer, triggerUserUpdate } = await import('@/lib/pusher-server');
                    const pusherServer = getPusherServer();

                    await pusherServer.trigger(`event-${eventId}`, 'odds-update', {
                        eventId,
                        timestamp: Math.floor(Date.now() / 1000),
                        yesPrice: result.userPrice,
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

            trackTrade('buy', option.toLowerCase() as 'yes' | 'no', numericAmount, 'binary');

            return NextResponse.json({
                success: true,
                orderId: result.userOrderId,
                userPrice: result.userPrice,
                polymarketPrice: result.polymarketPrice,
                amount: result.userAmount,
            });
        }

        // PHASE 2: Fallback to internal AMM for non-Polymarket events
        const { RequestQueue } = await import('@/lib/queue');
        const internalResult = await RequestQueue.enqueue(
            `bet:${eventId}`,
            async () => {
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
                        }
                    })
                ) as any;

                const b = event.liquidityParameter || 10000;
                const currentQYes = event.qYes || 0;
                const currentQNo = event.qNo || 0;

                const tokensReceived = calculateTokensForCost(
                    currentQYes,
                    currentQNo,
                    numericAmount,
                    option as 'YES' | 'NO',
                    b
                );

                const newQYes = option === 'YES' ? currentQYes + tokensReceived : currentQYes;
                const newQNo = option === 'NO' ? currentQNo + tokensReceived : currentQNo;
                const newOdds = calculateLMSROdds(newQYes, newQNo, b);

                const [updatedEvent, orderRecord] = await withTimeout(
                    prisma.$transaction([
                        prisma.event.update({
                            where: { id: eventId },
                            data: {
                                qYes: newQYes,
                                qNo: newQNo,
                                yesOdds: newOdds.yesPrice,
                                noOdds: newOdds.noPrice
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
                    ]) as Promise<[any, any]>
                );

                return { updatedEvent, tokensReceived, newOdds, orderRecord };
            }
        );

        // 4. Publish to Pusher for Real-time Updates (non-blocking)
        (async () => {
            try {
                const { getPusherServer, triggerUserUpdate } = await import('@/lib/pusher-server');
                const pusherServer = getPusherServer();

                await pusherServer.trigger(`event-${eventId}`, 'odds-update', {
                    eventId,
                    timestamp: Math.floor(Date.now() / 1000),
                    yesPrice: internalResult.newOdds.yesPrice,
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
        console.log(`✅ Trade executed: ${option} $${numericAmount} → ${internalResult.tokensReceived.toFixed(2)} tokens. New Price: ${internalResult.newOdds.yesPrice.toFixed(2)} (${totalTime}ms)`);

        // Track trade metrics in Sentry
        trackTrade(
            'buy',
            option.toLowerCase() as 'yes' | 'no',
            numericAmount,
            eventMeta.type === 'BINARY' ? 'binary' : eventMeta.type === 'GROUPED' ? 'grouped' : 'multiple'
        );
        trackApiLatency('/api/bets', totalTime, 200);

        // 5. Minimal cache invalidation (non-blocking)
        Promise.all([
            redis.del(`event:${eventId}`).catch(() => { }),
            redis.del(`event:amm:${eventId}`).catch(() => { })
        ]).catch(err => console.error('Post-bet cleanup failed:', err));


        // 6. Return Result
        return NextResponse.json({
            success: true,
            orderId: internalResult.orderRecord.id,
            tokensReceived: internalResult.tokensReceived,
            priceAtTrade: option === 'YES' ? internalResult.newOdds.yesPrice : internalResult.newOdds.noPrice,
            newYesPrice: internalResult.newOdds.yesPrice,
            newNoPrice: internalResult.newOdds.noPrice
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
