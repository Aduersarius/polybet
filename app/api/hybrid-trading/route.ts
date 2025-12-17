export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { placeHybridOrder, getOrderBook } from '@/lib/hybrid-trading';
import { requireAuth } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { assertSameOrigin } from '@/lib/csrf';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        assertSameOrigin(request);
        const body = await request.json();
        const {
            eventId,
            side,
            option, // For binary events ('YES'/'NO')
            outcomeId, // For multiple events (UUID)
            amount,
            price,
            orderType = 'market', // 'market' or 'limit'
            userId // For development - bypass auth
        } = body;

        console.log('API received:', { eventId, side, option, outcomeId, amount, userId });

        // Get authenticated user
        let sessionUserId: string;
        try {
            const user = await requireAuth(request);
            sessionUserId = user.id;
            console.log('Authenticated User ID:', sessionUserId);
        } catch (error) {
            // If requireAuth throws, it returns a 401 Response
            if (error instanceof Response) {
                return error;
            }
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Validation
        const targetOption = option || outcomeId; // Unified target

        if (!eventId || !side || !targetOption || !amount) {
            return NextResponse.json({
                error: 'Missing required fields: eventId, side, option/outcomeId, amount'
            }, { status: 400 });
        }

        if (!['buy', 'sell'].includes(side)) {
            return NextResponse.json({ error: 'Side must be "buy" or "sell"' }, { status: 400 });
        }

        // For binary events, validate option specifically if provided
        if (option && !['YES', 'NO'].includes(option)) {
            return NextResponse.json({ error: 'For binary events, option must be "YES" or "NO"' }, { status: 400 });
        }

        if (amount <= 0) {
            return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
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
            parseFloat(amount),
            orderType === 'limit' ? parseFloat(price) : undefined
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
            await Promise.all([
                redis.del(`event:${eventId}`).catch(() => { }),
                redis.del(`event:amm:${eventId}`).catch(() => { }),
                redis.del(cacheKey).catch(() => { })
            ]);
        }

        return NextResponse.json({
            success: true,
            orderId: result.orderId,
            totalFilled: result.totalFilled,
            averagePrice: result.averagePrice,
            trades: result.trades,
            newOdds: {},
            orderType: orderType,
            amount: parseFloat(amount),
            price: orderType === 'limit' ? parseFloat(price) : undefined,
            warning: result.warning,
        });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Hybrid trading failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'BALANCE_SCHEMA_MISMATCH') {
            return NextResponse.json({
                error: 'Trading temporarily unavailable: balance schema mismatch. Run latest migrations for Balance table.',
            }, { status: 503 });
        }

        return NextResponse.json({
            error: 'Hybrid trading failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
