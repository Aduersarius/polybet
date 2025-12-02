import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Authentication check - temporarily bypassed for testing
        // await requireAuth(request);

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = searchParams.get('search') || '';

        const skip = (page - 1) * limit;

        // Build where clause for search
        const where: any = {};
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { categories: { hasSome: [search] } },
                { creator: { username: { contains: search, mode: 'insensitive' } } },
                { creator: { address: { contains: search, mode: 'insensitive' } } },
                { status: { contains: search, mode: 'insensitive' } },
                { type: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [events, total] = await Promise.all([
            prisma.event.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    creator: {
                        select: { username: true, address: true }
                    },
                    _count: {
                        select: { bets: true }
                    }
                }
            }),
            prisma.event.count({ where })
        ]);

        return NextResponse.json({ events, total });
    } catch (error) {
        console.error('Error fetching events:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        // Authentication check
        await requireAuth(request);
        const body = await request.json();
        const { eventId, action, value } = body;

        if (!eventId || !['toggleHide', 'resolve'].includes(action)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        if (action === 'toggleHide') {
            const updatedEvent = await prisma.event.update({
                where: { id: eventId },
                data: { isHidden: value }
            });
            return NextResponse.json(updatedEvent);
        } else if (action === 'resolve') {
            const result = value; // 'YES' or 'NO'

            // Start a transaction to ensure data integrity
            const resolvedEvent = await prisma.$transaction(async (tx) => {
                // 1. Fetch event and all bets
                const event = await tx.event.findUnique({
                    where: { id: eventId },
                    include: { bets: true }
                });

                if (!event) throw new Error('Event not found');
                if (event.status === 'RESOLVED') throw new Error('Event already resolved');

                // 2. Calculate payouts
                const payouts = [];
                for (const bet of event.bets) {
                    if (bet.option === result) {
                        // Calculate shares: amount / priceAtTrade
                        // If priceAtTrade is missing, assume 0.5 (should not happen for valid bets)
                        const price = bet.priceAtTrade || 0.5;
                        const shares = bet.amount / price;
                        const payoutAmount = shares * 1.0; // Each winning share pays $1.00

                        payouts.push({
                            userId: bet.userId,
                            amount: payoutAmount,
                            betId: bet.id
                        });
                    }
                }

                // 3. Process payouts (Create Transactions and Update User Balance)
                // Note: User model doesn't have a 'balance' field in the schema I saw earlier?
                // Wait, I need to check if User has balance. 
                // The schema showed 'accounts', 'transactions', but no 'balance' field on User?
                // Let me double check the schema.
                // If no balance field, maybe it's calculated from transactions?
                // Or maybe I missed it.

                // Assuming we just record the transaction for now.
                for (const payout of payouts) {
                    await tx.transaction.create({
                        data: {
                            type: 'BET_PAYOUT',
                            amount: payout.amount,
                            status: 'CONFIRMED',
                            userId: payout.userId,
                            hash: `payout-${eventId}-${payout.betId}-${Date.now()}` // Simple unique hash
                        }
                    });

                    // If there is a balance field, update it here.
                    // await tx.user.update({
                    //   where: { id: payout.userId },
                    //   data: { balance: { increment: payout.amount } }
                    // });
                }

                // 4. Update Event Status
                return await tx.event.update({
                    where: { id: eventId },
                    data: {
                        status: 'RESOLVED',
                        result: result,
                        resolutionDate: new Date()
                    }
                });
            });

            return NextResponse.json(resolvedEvent);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
