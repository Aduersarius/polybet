import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
