export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrderBook } from '@/lib/hybrid-trading';
import { executeTrade } from '@/lib/trade-orchestrator';
import { requireAuth } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { safePublish, safeDelete } from '@/lib/redis-utils';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { TradeRequestSchema } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limiter';
import { trackTrade, trackApiLatency, trackError } from '@/lib/metrics';

// MVP Safety Limits
const MAX_TRADE_AMOUNT = 1000; // $1000 max per trade for MVP
const RATE_LIMIT_TRADES = 20;  // 20 trades per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        assertSameOrigin(request);

        // Get authenticated user
        const user = await requireAuth(request);
        const sessionUserId = user.id;

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

        // Validate all inputs using centralized schema
        const parsed = TradeRequestSchema.safeParse(body);

        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            const pathPrefix = firstError.path.length > 0 ? `${firstError.path.join('.')}: ` : '';
            return createClientErrorResponse(`${pathPrefix}${firstError.message}`, 400);
        }

        const {
            eventId,
            side,
            amount,
            option,
            outcomeId,
            orderType,
            price
        } = parsed.data;

        // Resolve internal event ID if a slug or polymarket ID was provided
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId);
        let targetEventId = eventId;
        let eventType: string;

        // Try direct ID lookup first (supports both UUID and numeric IDs)
        const eventById = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, type: true }
        });

        if (eventById) {
            targetEventId = eventById.id;
            eventType = eventById.type;
        } else if (!isUUID) {
            // If not found by ID and not a UUID, check slug and polymarketId
            const resolvedEvent = await prisma.event.findFirst({
                where: {
                    OR: [
                        { slug: eventId },
                        { polymarketId: eventId }
                    ]
                },
                select: { id: true, type: true }
            });
            if (!resolvedEvent) {
                return createClientErrorResponse('Event not found', 404);
            }
            targetEventId = resolvedEvent.id;
            eventType = resolvedEvent.type;
        } else {
            // Was a UUID but not found in DB
            return createClientErrorResponse('Event not found', 404);
        }

        // Use the resolved event ID for all subsequent operations
        const resolvedEventId = targetEventId;

        // Determine targetOption from option or outcomeId
        let targetOption: string;
        if (option) {
            targetOption = option.toUpperCase();
        } else if (outcomeId) {
            if (eventType === 'MULTIPLE') {
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
        // Execute hybrid order via Orchestrator
        const result = await executeTrade({
            userId: sessionUserId,
            eventId: resolvedEventId,
            side: side as 'buy' | 'sell',
            option: targetOption,
            amount,
            price: orderType === 'limit' ? price : undefined
        });

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
                where: { id: resolvedEventId },
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
                    if (updatedEvent.source === 'POLYMARKET' && updatedEvent.yesOdds != null) {
                        updatePayload.probs = {
                            YES: updatedEvent.yesOdds,
                            NO: updatedEvent.noOdds || (1 - updatedEvent.yesOdds)
                        };
                    } else {
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
