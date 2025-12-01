export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { placeHybridOrder, getOrderBook } from '@/lib/hybrid-trading';
import { requireAuth } from '@/lib/auth';
import { redis } from '@/lib/redis';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const {
            eventId,
            side,
            option, // For binary events
            outcomeId, // For multiple events
            amount,
            price,
            orderType = 'market', // 'market' or 'limit'
            userId // For development - bypass auth
        } = body;

        // For development, use userId from body if provided
        let sessionUserId = userId;

        // In production, require authentication
        if (!userId) {
            const session = await requireAuth(request);
            sessionUserId = session.user.id;
        }

        // Validation
        if (!eventId || !side || (!option && !outcomeId) || !amount) {
            return NextResponse.json({
                error: 'Missing required fields: eventId, side, option or outcomeId, amount'
            }, { status: 400 });
        }

        if (!['buy', 'sell'].includes(side)) {
            return NextResponse.json({
                error: 'Side must be "buy" or "sell"'
            }, { status: 400 });
        }

        // For binary events, validate option
        if (option && !['YES', 'NO'].includes(option)) {
            return NextResponse.json({
                error: 'Option must be "YES" or "NO"'
            }, { status: 400 });
        }

        if (amount <= 0) {
            return NextResponse.json({ 
                error: 'Amount must be greater than 0' 
            }, { status: 400 });
        }

        if (orderType === 'limit' && (!price || price <= 0 || price >= 1)) {
            return NextResponse.json({ 
                error: 'For limit orders, price must be between 0 and 1' 
            }, { status: 400 });
        }

        // Execute hybrid order
        const result = await placeHybridOrder(
            sessionUserId,
            eventId,
            side as 'buy' | 'sell',
            option || outcomeId, // Use option for binary, outcomeId for multiple
            parseFloat(amount),
            orderType === 'limit' ? parseFloat(price) : undefined
        );

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Order failed' 
            }, { status: 400 });
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Hybrid order executed in ${totalTime}ms: ${side} ${amount} ${option} @ ${result.averagePrice}`);

        // Publish real-time updates via WebSocket and Redis
        if (redis) {
            const updatePayload = {
                eventId,
                timestamp: Math.floor(Date.now() / 1000),
                side,
                option,
                amount: result.totalFilled,
                averagePrice: result.averagePrice,
                trades: result.trades?.length || 0
            };

            // Publish to Redis for WebSocket broadcasting
            await redis.publish('hybrid-trades', JSON.stringify(updatePayload));

            // Update cache invalidation for event data
            await Promise.all([
                redis.del(`event:${eventId}`).catch(() => {}),
                redis.del(`event:amm:${eventId}`).catch(() => {}),
                redis.del(`orderbook:${eventId}:${option}`).catch(() => {})
            ]);
        }

        // Return success response
        return NextResponse.json({
            success: true,
            orderId: result.orderId,
            totalFilled: result.totalFilled,
            averagePrice: result.averagePrice,
            trades: result.trades,
            newOdds: result.newOdds,
            orderType: orderType, // Include order type in response
            amount: parseFloat(amount), // Include original amount
            price: orderType === 'limit' ? parseFloat(price) : undefined // Include limit price
        });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Hybrid trading failed after ${errorTime}ms:`, error);

        return NextResponse.json({
            error: 'Hybrid trading failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Get order book for an event
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const option = searchParams.get('option') as 'YES' | 'NO';
    const outcomeId = searchParams.get('outcomeId');

    if (!eventId || (!option && !outcomeId)) {
        return NextResponse.json({
            error: 'Missing required parameters: eventId and either option or outcomeId'
        }, { status: 400 });
    }

    if (option && !['YES', 'NO'].includes(option)) {
        return NextResponse.json({
            error: 'Option must be "YES" or "NO"'
        }, { status: 400 });
    }

    try {
        // For now, treat outcomeId as option for backward compatibility
        // TODO: Implement proper multiple outcome order book
        const orderOption = option || (outcomeId === 'YES' || outcomeId === 'NO' ? outcomeId : 'YES');

        // Try to get from cache first
        const cacheKey = `orderbook:${eventId}:${orderOption}`;
        let orderbook;

        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                orderbook = JSON.parse(cached);
            }
        }

        // If not cached, fetch from database
        if (!orderbook) {
            orderbook = await getOrderBook(eventId, orderOption);

            // Cache for 10 seconds
            if (redis) {
                await redis.setex(cacheKey, 10, JSON.stringify(orderbook));
            }
        }

        return NextResponse.json(orderbook);

    } catch (error) {
        console.error('Error fetching orderbook:', error);
        return NextResponse.json({
            error: 'Failed to fetch orderbook'
        }, { status: 500 });
    }
}