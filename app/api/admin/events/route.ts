import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { resolveMarket } from '@/lib/hybrid-trading';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Authentication check
        await requireAuth(request);
        const events = await prisma.event.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                creator: {
                    select: { username: true, address: true }
                },
                _count: {
                    select: { bets: true }
                }
            }
        });

        return NextResponse.json(events);
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

        let updatedEvent;
        if (action === 'toggleHide') {
            updatedEvent = await prisma.event.update({
                where: { id: eventId },
                data: { isHidden: value }
            });
        } else if (action === 'resolve') {
            // Use the new resolution logic that handles payouts and commissions
            const result = await resolveMarket(eventId, value);
            return NextResponse.json(result);
        }

        return NextResponse.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
