import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

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

        let updateData = {};
        if (action === 'toggleHide') {
            updateData = { isHidden: value };
        } else if (action === 'resolve') {
            updateData = {
                status: 'RESOLVED',
                result: value // 'YES', 'NO', etc.
            };
        }

        const updatedEvent = await prisma.event.update({
            where: { id: eventId },
            data: updateData
        });

        return NextResponse.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
