export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';

export async function POST(request: Request) {
    const startTime = Date.now();

    // Rate limiting with IP bypass for 185.72.224.35
    const { heavyLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
    const identifier = getRateLimitIdentifier(request);
    const rateLimitResponse = await checkRateLimit(heavyLimiter, identifier);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const body = await request.json();
        // Support both 'option' (from generate-trades) and 'outcome' (from TradingPanel)
        const { eventId, amount, userId: bodyUserId } = body;
        const option = body.option || body.outcome;

        if (!eventId || !option || !amount) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Fetch Event State with caching
        const { getOrSet } = await import('@/lib/cache');
        const event = await getOrSet(
            `amm:${eventId}`,
            async () => {
                return (await prisma.event.findUnique({
                    where: { id: eventId },
                    select: {
                        id: true,
                        liquidityParameter: true,
                        qYes: true,
                        qNo: true,
                        status: true,
                    }
                })) as any;
            },
            { ttl: 300, prefix: 'event' } // Cache AMM state for 5 minutes
        );

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
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

        // 3. Database Transaction (Update Event + Create Bet)
        // Get or create user
        let user;
        const targetUserId = bodyUserId || 'dev-user'; // Default to dev-user if not provided

        // Try to find user by ID or create if it's the dev-user
        user = await prisma.user.findUnique({ where: { id: targetUserId } });

        if (!user && targetUserId === 'dev-user') {
            user = await prisma.user.create({
                data: {
                    id: 'dev-user',
                    username: 'Dev User',
                    address: '0xDevUser',
                    clerkId: 'dev-user-clerk-id'
                }
            });
        } else if (!user) {
            // Fallback for other IDs or anonymous
            const anonymousId = `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            user = await prisma.user.create({
                data: {
                    address: anonymousId,
                    username: `Anonymous_${anonymousId.slice(-8)}`,
                }
            });
        }

        const [updatedEvent, newBet] = await prisma.$transaction([
            prisma.event.update({
                where: { id: eventId },
                data: {
                    qYes: newQYes,
                    qNo: newQNo,
                    yesOdds: newOdds.yesPrice,
                    noOdds: newOdds.noPrice
                }
            }),
            prisma.bet.create({
                data: {
                    amount: parseFloat(amount),
                    option,
                    userId: user.id,
                    eventId,
                }
            })
        ]);

        // 4. Publish to Redis for Real-time Updates (if available)
        if (redis) {
            const updatePayload = {
                eventId,
                timestamp: Math.floor(Date.now() / 1000),
                yesPrice: newOdds.yesPrice,
                volume: parseFloat(amount) // This trade's volume
            };
            await redis.publish('event-updates', JSON.stringify(updatePayload));
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Trade executed: ${option} $${amount} -> ${tokensReceived.toFixed(2)} tokens. New Price: ${newOdds.yesPrice.toFixed(2)}`);

        // Invalidate caches
        const { invalidate, invalidatePattern } = await import('@/lib/cache');
        await invalidate(eventId, 'event'); // Invalidate this event's cache
        await invalidatePattern('events:all:*'); // Invalidate all events list caches
        await invalidatePattern(`bets:event:${eventId}:*`); // Invalidate all bet caches for this event
        console.log(`🗑️ Invalidated cache for event: ${eventId}`);

        // 5. Return Result
        return NextResponse.json({
            success: true,
            betId: newBet.id,
            tokensReceived,
            priceAtTrade: option === 'YES' ? newOdds.yesPrice : newOdds.noPrice, // Approximate price after trade
            newYesPrice: newOdds.yesPrice,
            newNoPrice: newOdds.noPrice
        });

    } catch (error) {
        console.error('❌ Trade failed:', error);
        return NextResponse.json({ error: 'Failed to place bet' }, { status: 500 });
    }
}
