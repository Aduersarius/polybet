import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';
import { resolveMarket } from '@/lib/hybrid-trading';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Admin authentication check
        await requireAdminAuth(request);

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100);
        const search = searchParams.get('search') || '';
        const skip = (page - 1) * limit;

        const where = search
            ? {
                OR: [
                    { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { categories: { has: search } },
                    { status: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { type: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    {
                        creator: {
                            OR: [
                                { username: { contains: search, mode: Prisma.QueryMode.insensitive } },
                                { address: { contains: search, mode: Prisma.QueryMode.insensitive } },
                            ]
                        }
                    }
                ]
            }
            : {};

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
                        select: { marketActivity: true }
                    }
                }
            }),
            prisma.event.count({ where })
        ]);

        // Normalize count property to match front-end expectation (_count.bets)
        const normalized = events.map((e: (typeof events)[number]) => ({
            ...e,
            _count: {
                bets: (e as any)._count?.marketActivity ?? 0
            }
        }));

        return NextResponse.json({ events: normalized, total });
    } catch (error) {
        console.error('Error fetching events:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        // Admin authentication check
        await requireAdminAuth(request);
        const body = await request.json();
        const { eventId, action, value } = body;

        if (!eventId || !['toggleHide', 'resolve', 'delete'].includes(action)) {
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
        } else if (action === 'delete') {
            // Soft-delete the event and drop any polymarket mappings so it can reappear in intake
            const [event] = await prisma.$transaction([
                prisma.event.update({
                    where: { id: eventId },
                    data: {
                        status: 'DELETED',
                        isHidden: true,
                    },
                }),
                prisma.polymarketMarketMapping.deleteMany({
                    where: { internalEventId: eventId },
                }),
            ]);
            updatedEvent = event;
        }

        return NextResponse.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
