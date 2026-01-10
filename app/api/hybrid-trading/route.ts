export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { placeHybridOrder, getOrderBook } from '@/lib/hybrid-trading';
import { requireAuth } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { safePublish, safeDelete } from '@/lib/redis-utils';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { validateString, validateNumber, validateUUID, validateEventId } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limiter';
import { trackTrade, trackApiLatency, trackError } from '@/lib/sentry-metrics';

// MVP Safety Limits
const MAX_TRADE_AMOUNT = 1000; // $1000 max per trade for MVP
const RATE_LIMIT_TRADES = 20;  // 20 trades per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        assertSameOrigin(request);

        // Get authenticated user first
        let sessionUserId: string;
        try {
            const user = await requireAuth(request);
            sessionUserId = user.id;
        } catch (error) {
            if (error instanceof Response) {
                return error;
            }
            return createClientErrorResponse('Unauthorized', 401);
        }

        // Rate limiting for trading (after auth, before processing)
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') || 'unknown';
        const rateLimit = await checkRateLimit(sessionUserId, ip, RATE_LIMIT_TRADES, RATE_LIMIT_WINDOW);
        if (!rateLimit.allowed) {
            const status = rateLimit.reason === 'UNAVAILABLE' ? 503 : 429;
            const message = rateLimit.reason === 'UNAVAILABLE'
                ? 'Trading temporarily unavailable, please try again later'
                : 'Too many trades. Please wait a moment before placing another order.';
            return createClientErrorResponse(message, status);
        }

        const body = await request.json();

        // Validate all inputs
        const eventIdResult = validateEventId(body.eventId, true);
        if (!eventIdResult.valid) {
            return createClientErrorResponse(`eventId: ${eventIdResult.error}`, 400);
        }

        const sideResult = validateString(body.side, { required: true, pattern: /^(buy|sell)$/ });
        if (!sideResult.valid) {
            return createClientErrorResponse(`side: ${sideResult.error || 'must be "buy" or "sell"'}`, 400);
        }

        const amountResult = validateNumber(body.amount, { required: true, min: 0.01, max: MAX_TRADE_AMOUNT });
        if (!amountResult.valid) {
            return createClientErrorResponse(`amount: ${amountResult.error}`, 400);
        }

        // Validate option or outcomeId (at least one required)
        let option: string | undefined;
        let outcomeId: string | undefined;

        if (body.option) {
            const optionResult = validateString(body.option, { required: false, pattern: /^(YES|NO)$/ });
            if (!optionResult.valid) {
                return createClientErrorResponse(`option: ${optionResult.error || 'must be "YES" or "NO"'}`, 400);
            }
            option = optionResult.sanitized;
        }

        if (body.outcomeId) {
            // Relax validation to allow CUIDs and other ID formats, not just UUIDs
            const outcomeIdResult = validateString(body.outcomeId, {
                required: false,
                maxLength: 50,
                pattern: /^[a-zA-Z0-9_-]+$/
            });
            if (!outcomeIdResult.valid) {
                return createClientErrorResponse(`outcomeId: ${outcomeIdResult.error}`, 400);
            }
            outcomeId = outcomeIdResult.sanitized;
        }

        if (!option && !outcomeId) {
            return createClientErrorResponse('Either option or outcomeId is required', 400);
        }

        // Validate price if orderType is limit
        const orderType = body.orderType || 'market';
        let price: number | undefined;

        if (orderType === 'limit') {
            if (body.price === undefined || body.price === null) {
                return createClientErrorResponse('Price is required for limit orders', 400);
            }
            const priceResult = validateNumber(body.price, { required: true, min: 0.01, max: 1 });
            if (!priceResult.valid) {
                return createClientErrorResponse(`price: ${priceResult.error}`, 400);
            }
            price = priceResult.sanitized;
        }

        const eventId = eventIdResult.sanitized!;
        const side = sideResult.sanitized as 'buy' | 'sell';
        const amount = amountResult.sanitized!;

        // Fetch event to determine type for correct parameter handling
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { type: true }
        });

        if (!event) {
            return createClientErrorResponse('Event not found', 404);
        }

        // Determine targetOption from option or outcomeId
        let targetOption: string;
        if (option) {
            targetOption = option.toUpperCase();
        } else if (outcomeId) {
            if (event.type === 'MULTIPLE') {
                // For MULTIPLE, the 'option' IS the outcomeId
                targetOption = outcomeId;
            } else {
                // Fetch outcome to get its name
                const outcome = await prisma.outcome.findUnique({
                    where: { id: outcomeId },
                    select: { name: true }
                });
                if (!outcome) {
                    return createClientErrorResponse('Outcome not found', 404);
                }
                targetOption = outcome.name;
            }
        } else {
            return createClientErrorResponse('Either option or outcomeId is required', 400);
        }

        // Note: Max amount already validated above with MAX_TRADE_AMOUNT constant

        // Execute hybrid order
        const result = await placeHybridOrder(
            sessionUserId,
            eventId,
            side as 'buy' | 'sell',
            targetOption,
            amount,
            orderType === 'limit' ? price : undefined
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Order failed' }, { status: 400 });
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Hybrid order executed in ${totalTime}ms: ${side} ${amount} ${targetOption} @ ${result.averagePrice}`);

        // Track trade metrics in Sentry
        trackTrade(
            side as 'buy' | 'sell',
            targetOption.toLowerCase() === 'yes' ? 'yes' : 'no',
            amount,
            'multiple' // hybrid trading handles multiple outcomes
        );
        trackApiLatency('/api/hybrid-trading', totalTime, 200);

        // Create a notification for the user (fire-and-forget)
        try {
            // Fetch event title and image for richer notification
            const eventData = await prisma.event.findUnique({
                where: { id: eventId },
                select: { title: true, imageUrl: true }
            });

            await prisma.notification.create({
                data: {
                    userId: sessionUserId,
                    type: 'BET_RESULT',
                    message: `Trade executed: ${side.toUpperCase()} ${amount} ${targetOption}`,
                    resourceId: eventId,
                    metadata: {
                        eventTitle: eventData?.title || 'Unknown Event',
                        imageUrl: eventData?.imageUrl || null,
                        side: side,
                        amount: result.totalFilled,
                        price: result.averagePrice,
                        outcome: targetOption,
                        outcomeId: outcomeId || null,
                    }
                },
            });
        } catch (err) {
            console.error('Failed to create trade notification:', err);
        }

        // Publish real-time updates via WebSocket and Redis
        if (redis) {
            let updatePayload: any = {
                eventId,
                timestamp: Math.floor(Date.now() / 1000),
                side,
                amount: result.totalFilled,
                averagePrice: result.averagePrice,
                trades: result.trades?.length || 0,
                outcomeId: outcomeId || undefined,
                option: option || undefined
            };

            // Fetch FRESH state from DB because placeHybridOrder already updated probabilities
            const updatedEvent = await prisma.event.findUnique({
                where: { id: eventId },
                include: { outcomes: true }
            });

            if (updatedEvent) {
                if (updatedEvent.type === 'MULTIPLE') {
                    // Send updated probabilities for ALL outcomes
                    updatePayload.outcomes = updatedEvent.outcomes.map(
                        (outcome: (typeof updatedEvent.outcomes)[number]) => ({
                            id: outcome.id,
                            name: outcome.name,
                            probability: outcome.probability || 0, // This is now fresh from DB
                            color: outcome.color
                        })
                    );
                } else {
                    // Binary update logic
                    const b = updatedEvent.liquidityParameter || 1000;
                    const qYes = updatedEvent.qYes || 0;
                    const qNo = updatedEvent.qNo || 0;
                    const sumExp = Math.exp(qYes / b) + Math.exp(qNo / b);
                    const probYes = Math.exp(qYes / b) / sumExp;
                    const probNo = Math.exp(qNo / b) / sumExp;

                    updatePayload.probs = {
                        YES: probYes,
                        NO: probNo
                    };
                }
            }

            // 5. Publish to Pusher (Soketi) for Frontend
            const { getPusherServer, triggerUserUpdate } = await import('@/lib/pusher-server');
            const pusherServer = getPusherServer();

            // Broad event update
            await pusherServer.trigger(`event-${eventId}`, 'odds-update', updatePayload).catch(err =>
                console.error('[Pusher] Event update failed:', err)
            );

            // User-specific update for positions
            await triggerUserUpdate(sessionUserId, 'user-update', {
                type: 'POSITION_UPDATE',
                payload: {
                    eventId,
                    timestamp: Date.now(),
                    side,
                    amount: result.totalFilled,
                    price: result.averagePrice
                }
            });

            // Invalidate Caches
            const cacheKey = outcomeId ? `orderbook:${eventId}:${outcomeId}` : `orderbook:${eventId}:${option}`;
            safeDelete(`event:${eventId}`);
            safeDelete(`event:amm:${eventId}`);
            safeDelete(cacheKey);
        }

        return NextResponse.json({
            success: true,
            orderId: result.orderId,
            totalFilled: result.totalFilled,
            averagePrice: result.averagePrice,
            trades: result.trades,
            newOdds: {},
            orderType: orderType,
            amount: amount,
            price: orderType === 'limit' ? price : null,
            warning: result.warning,
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        trackError('trading', error instanceof Error ? error.message : 'unknown');
        trackApiLatency('/api/hybrid-trading', totalTime, 500);

        if (error instanceof Error && error.message === 'BALANCE_SCHEMA_MISMATCH') {
            return createClientErrorResponse('Trading temporarily unavailable. Please try again later.', 503);
        }
        return createErrorResponse(error);
    }
}
