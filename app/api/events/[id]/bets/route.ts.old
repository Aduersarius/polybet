import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';

// GET /api/events/[id]/bets - Get recent bets for an event
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: eventId } = await params;

        const bets = await prisma.bet.findMany({
            where: { eventId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                user: {
                    select: {
                        username: true,
                        address: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        return NextResponse.json(bets);
    } catch (error) {
        console.error('Error fetching bets:', error);
        return NextResponse.json(
            { error: 'Failed to fetch bets' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: eventId } = await params;
        const { outcome, amount } = await request.json();

        if (!outcome || !amount || amount <= 0) {
            return NextResponse.json(
                { error: 'Invalid outcome or amount' },
                { status: 400 }
            );
        }

        if (!['YES', 'NO'].includes(outcome)) {
            return NextResponse.json(
                { error: 'Invalid outcome. Must be YES or NO' },
                { status: 400 }
            );
        }

        // Get current event state
        const event = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        if (event.status !== 'ACTIVE') {
            return NextResponse.json(
                { error: 'Event is not active' },
                { status: 400 }
            );
        }

        // Use default AMM values if fields don't exist yet
        const qYes = (event as any).qYes || 0;
        const qNo = (event as any).qNo || 0;
        const liquidityParameter = (event as any).liquidityParameter || 100.0;

        // Calculate current odds
        const currentOdds = calculateLMSROdds(qYes, qNo, liquidityParameter);

        // Calculate tokens to receive for the given amount
        const tokensToReceive = calculateTokensForCost(
            qYes,
            qNo,
            amount,
            outcome as 'YES' | 'NO',
            liquidityParameter
        );

        // Calculate new qYes/qNo after the trade
        const newQYes = outcome === 'YES' ? qYes + tokensToReceive : qYes;
        const newQNo = outcome === 'NO' ? qNo + tokensToReceive : qNo;

        // Calculate new odds
        const newOdds = calculateLMSROdds(newQYes, newQNo, liquidityParameter);

        // Get a user (for now, use the first user or create a demo user)
        let user = await prisma.user.findFirst();
        if (!user) {
            user = await prisma.user.create({
                data: {
                    address: '0x' + Math.random().toString(16).substr(2, 40),
                    username: 'Demo Trader',
                },
            });
        }

        // Create the bet record
        const bet = await prisma.bet.create({
            data: {
                amount,
                option: outcome,
                userId: user.id,
                eventId,
            },
        });

        // Update event with new AMM state and cached odds
        // Use raw SQL for now since the schema fields might not exist
        try {
            await prisma.$executeRaw`
            UPDATE "Event"
            SET "qYes" = ${newQYes},
                "qNo" = ${newQNo},
                "yesOdds" = ${newOdds.yesOdds},
                "noOdds" = ${newOdds.noOdds}
            WHERE id = ${eventId}
          `;
        } catch (error) {
            // If columns don't exist, just continue without updating AMM state
            console.warn('Could not update AMM fields, they may not exist in database yet');
        }

        return NextResponse.json({
            success: true,
            bet,
            tokensReceived: tokensToReceive,
            newOdds,
            priceAtTrade: outcome === 'YES' ? currentOdds.yesPrice : currentOdds.noPrice,
        });

    } catch (error) {
        console.error('Error placing bet:', error);
        return NextResponse.json(
            { error: 'Failed to place bet' },
            { status: 500 }
        );
    }
}