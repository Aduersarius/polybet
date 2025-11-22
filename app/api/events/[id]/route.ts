import { NextRequest, NextResponse } from 'next/server';
import { calculateLMSROdds } from '@/lib/amm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    try {
        const { prisma } = await import('@/lib/prisma');
        const { id } = await params;

        const queryPromise = prisma.event.findUnique({
            where: { id },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        address: true,
                    },
                },
            },
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database query timeout')), 8000);
        });

        const event = await Promise.race([queryPromise, timeoutPromise]);

        if (!event) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        // Get pre-calculated AMM state and volume stats
        const qYes = (event as any).qYes || 0;
        const qNo = (event as any).qNo || 0;
        const b = (event as any).liquidityParameter || 10000.0;

        const bets = await prisma.bet.findMany({
            where: { eventId: id },
            select: { amount: true },
        });

        const volume = bets.reduce((sum, bet) => sum + bet.amount, 0);

        // Use LMSR to calculate current odds from AMM state
        let odds;
        if (qYes === 0 && qNo === 0) {
            // No trades yet - use 50/50 as default
            odds = {
                yesPrice: 0.5,
                noPrice: 0.5,
                yesOdds: 2.0,
                noOdds: 2.0
            };
        } else {
            // Calculate odds using actual token positions
            const diff = (qNo - qYes) / b;
            const yesPrice = 1 / (1 + Math.exp(diff));
            const noPrice = 1 - yesPrice;

            odds = {
                yesPrice,
                noPrice,
                yesOdds: 1 / yesPrice,
                noOdds: 1 / noPrice
            };
        }

        const yesOdds = odds.yesPrice; // Return price (probability) instead of odds
        const noOdds = odds.noPrice;  // Return price (probability) instead of odds

        // Add calculated odds to the response
        const eventWithOdds = {
            ...event,
            yesOdds,
            noOdds,
            volume,
            betCount: bets.length,
        };

        const queryTime = Date.now() - startTime;
        console.log(`✅ Event ${id} fetched in ${queryTime}ms`);

        return NextResponse.json(eventWithOdds);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Event fetch failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json(
            { error: 'Failed to fetch event' },
            { status: 500 }
        );
    }
}
