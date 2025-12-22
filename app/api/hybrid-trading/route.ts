export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { placeHybridOrder, getOrderBook } from '@/lib/hybrid-trading';
import { requireAuth } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { validateString, validateNumber, validateUUID } from '@/lib/validation';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        assertSameOrigin(request);
        const body = await request.json();

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

        // Validate all inputs
        const eventIdResult = validateUUID(body.eventId, true);
        if (!eventIdResult.valid) {
            return createClientErrorResponse(`eventId: ${eventIdResult.error}`, 400);
        }

        const sideResult = validateString(body.side, { required: true, pattern: /^(buy|sell)$/ });
        if (!sideResult.valid) {
            return createClientErrorResponse(`side: ${sideResult.error || 'must be "buy" or "sell"'}`, 400);
        }

        const amountResult = validateNumber(body.amount, { required: true, min: 0.01, max: 1000000 });
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
            const outcomeIdResult = validateUUID(body.outcomeId, false);
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

        // Determine targetOption from option or outcomeId
        let targetOption: string;
        if (option) {
            targetOption = option.toUpperCase();
        } else if (outcomeId) {
            // Fetch outcome to get its name
            const outcome = await prisma.outcome.findUnique({
                where: { id: outcomeId },
                select: { name: true }
            });
            if (!outcome) {
                return createClientErrorResponse('Outcome not found', 404);
            }
            targetOption = outcome.name;
        } else {
            return createClientErrorResponse('Either option or outcomeId is required', 400);
        }

        // Risk management: maximum bet amount
        const MAX_BET_AMOUNT = 10000;
        if (amount > MAX_BET_AMOUNT) {
            return NextResponse.json({ error: `Maximum bet amount is $${MAX_BET_AMOUNT.toLocaleString()}` }, { status: 400 });
        }

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

        // Create a notification for the user (fire-and-forget)
        try {
            await prisma.notification.create({
                data: {
                    userId: sessionUserId,
                    type: 'BET_RESULT',
                    message: `Trade executed: ${side.toUpperCase()} ${amount} ${targetOption}`,
                    resourceId: eventId,
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

            // Publish to Redis for WebSocket broadcasting
            await redis.publish('hybrid-trades', JSON.stringify(updatePayload));

            // Publish user-specific update
            await redis.publish('user-updates', JSON.stringify({
                userId: sessionUserId,
                type: 'POSITION_UPDATE',
                payload: {
                    eventId,
                    timestamp: Date.now(),
                    side,
                    amount: result.totalFilled,
                    price: result.averagePrice
                }
            }));

            // Invalidate Caches
            const cacheKey = outcomeId ? `orderbook:${eventId}:${outcomeId}` : `orderbook:${eventId}:${option}`;
            if (redis && (redis as any).status === 'ready') {
                await Promise.all([
                    redis.del(`event:${eventId}`).catch(() => { }),
                    redis.del(`event:amm:${eventId}`).catch(() => { }),
                    redis.del(cacheKey).catch(() => { })
                ]);
            }
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
        if (error instanceof Error && error.message === 'BALANCE_SCHEMA_MISMATCH') {
            return createClientErrorResponse('Trading temporarily unavailable. Please try again later.', 503);
        }
        return createErrorResponse(error);
    }
}
