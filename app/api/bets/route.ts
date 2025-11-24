export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        // Allow anonymous betting - no authentication required
        const { auth } = await import('@clerk/nextjs/server');
        const { userId: clerkUserId } = await auth();

        const body = await request.json();
        // Support both 'option' (from generate-trades) and 'outcome' (from TradingPanel)
        const { eventId, amount } = body;
        const option = body.option || body.outcome;

        if (!eventId || !option || !amount) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Fetch Event State
        const event = (await prisma.event.findUnique({
            where: { id: eventId }
        })) as any;

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
        // Get or create user (anonymous if not logged in)
        let user = null;
        if (clerkUserId) {
            // Logged in user
            user = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        clerkId: clerkUserId,
                        // Additional user data can be populated from Clerk if needed
                    }
                });
            }
        } else {
            // Anonymous user - create new anonymous user
            const anonymousId = `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            user = await prisma.user.create({
                data: {
                    address: anonymousId, // Use address field for anonymous users
                    username: `Anonymous_${anonymousId.slice(-8)}`,
                    // No clerkId for anonymous users
                }
            });
        }

        const [updatedEvent, newBet] = await prisma.$transaction([
            prisma.event.update({
                where: { id: eventId },
                data: {
                    qYes: newQYes,
                    qNo: newQNo,
                    yesOdds: newOdds.yesPrice, // Store as probability (0-1) or percentage? Schema says Float. Usually 0.55
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
