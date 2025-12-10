import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const { address } = await params;

        let user = await prisma.user.findUnique({
            where: { address },
            include: {
                transactions: true
            }
        });

        if (!user) {
            // Try by ID
            user = await prisma.user.findUnique({
                where: { id: address },
                include: {
                    transactions: true
                }
            });
        }

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check privacy settings
        const userSettings = (user as any).settings as Record<string, any> || {};
        const privacySettings = userSettings.privacy || { publicProfile: true, showActivity: true };

        // If profile is not public, return minimal data
        if (!privacySettings.publicProfile) {
            return NextResponse.json({
                username: user.username,
                avatarUrl: user.avatarUrl,
                image: user.image,
                isPrivate: true,
                stats: null
            });
        }

        const userId = user.id;

        // Get all market activities (bets and trades) for this user
        const allActivities = await prisma.marketActivity.findMany({
            where: {
                userId,
                type: { in: ['BET', 'TRADE'] }
            },
            include: {
                event: {
                    select: {
                        status: true,
                        result: true,
                        type: true
                    }
                }
            }
        });

        // Calculate volume (total amount spent on bets/trades)
        const totalVolume = allActivities.reduce((sum, activity) => {
            // Volume = amount * price (or just amount if price is null)
            return sum + (activity.amount * (activity.price || 1));
        }, 0);

        // Calculate bet count
        const betCount = allActivities.length;

        // Calculate profit/loss from resolved events
        let totalProfit = 0;
        const resolvedActivities = allActivities.filter(a => a.event.status === 'RESOLVED');

        for (const activity of resolvedActivities) {
            if (activity.event.type === 'BINARY') {
                // Binary event - check if option matches result
                if (activity.option === activity.event.result) {
                    // Won bet - simplified payout calculation
                    // In reality, this should use the actual payout from the AMM
                    totalProfit += activity.amount * 0.95; // Approximate payout
                } else {
                    // Lost bet
                    totalProfit -= activity.amount;
                }
            } else if (activity.event.type === 'MULTIPLE' && activity.outcomeId) {
                // Multiple outcome event - check if outcome matches result
                if (activity.outcomeId === activity.event.result) {
                    // Won bet
                    totalProfit += activity.amount * 0.95; // Approximate payout
                } else {
                    // Lost bet
                    totalProfit -= activity.amount;
                }
            }
        }

        // Calculate positions value (current value of open positions)
        // Get user's balances for outcome tokens with event details
        const positionBalances = await prisma.balance.findMany({
            where: {
                userId,
                eventId: { not: null },
                amount: { gt: 0 }
            }
        });

        // Get all unique event IDs
        const eventIds = [...new Set(positionBalances.map(b => b.eventId).filter(Boolean))] as string[];

        // Fetch all events and outcomes in bulk
        const [events, outcomes] = await Promise.all([
            prisma.event.findMany({
                where: {
                    id: { in: eventIds },
                    status: 'ACTIVE'
                },
                select: {
                    id: true,
                    type: true,
                    qYes: true,
                    qNo: true,
                    liquidityParameter: true
                }
            }),
            prisma.outcome.findMany({
                where: {
                    eventId: { in: eventIds }
                },
                select: {
                    id: true,
                    eventId: true,
                    probability: true
                }
            })
        ]);

        // Create maps for quick lookup
        const eventMap = new Map(events.map(e => [e.id, e]));
        const outcomeMap = new Map(outcomes.map(o => [o.id, o]));

        let positionsValue = 0;

        for (const balance of positionBalances) {
            if (!balance.eventId) continue;

            const event = eventMap.get(balance.eventId);
            if (!event) continue;

            let currentPrice = 0.5; // Default price

            if (balance.outcomeId) {
                // Multiple outcome - get probability from outcome
                const outcome = outcomeMap.get(balance.outcomeId);
                if (outcome) {
                    currentPrice = outcome.probability || 0.5;
                }
            } else if (event.type === 'BINARY') {
                // Binary event - calculate from qYes/qNo
                const { calculateLMSROdds } = await import('@/lib/amm');
                const odds = calculateLMSROdds(
                    event.qYes || 0,
                    event.qNo || 0,
                    event.liquidityParameter || 20000
                );
                // Use YES price if token is YES, NO price otherwise
                currentPrice = balance.tokenSymbol?.includes('YES') ? odds.yesPrice : odds.noPrice;
            }

            // Calculate current value of position
            const currentValue = balance.amount.toNumber() * currentPrice;
            positionsValue += currentValue;
        }

        return NextResponse.json({
            username: user.username,
            avatarUrl: user.avatarUrl,
            image: user.image, // Include image field from Better Auth
            joinedAt: user.createdAt,
            stats: {
                volume: totalVolume,
                profit: totalProfit,
                positions: positionsValue,
                betCount: betCount
            }
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user stats' },
            { status: 500 }
        );
    }
}
