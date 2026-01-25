import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';
import { resolveMarket } from '@/lib/hybrid-trading';
import { EventFilterSchema, AdminEventActionSchema } from '@/lib/schemas/common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Admin authentication check
        await requireAdminAuth(request);

        const { searchParams } = new URL(request.url);
        const params = Object.fromEntries(searchParams.entries());
        const parsed = EventFilterSchema.safeParse(params);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid search parameters' }, { status: 400 });
        }

        const { page, limit, search, status, type, visibility } = parsed.data;
        const skip = (page - 1) * limit;

        // Build filter conditions array
        const conditions: Prisma.EventWhereInput[] = [
            // Exclude sports/esports categories
            {
                NOT: {
                    categories: {
                        hasSome: ['SPORTS', 'ESPORTS']
                    }
                }
            },
            {
                NOT: {
                    categories: {
                        hasSome: ['sports', 'esports', 'Sports', 'Esports']
                    }
                }
            }
        ];

        // Add status filter
        if (status && status !== 'all') {
            conditions.push({ status: status });
        }

        // Add type filter
        if (type && type !== 'all') {
            conditions.push({ type: type });
        }

        // Add visibility filter
        if (visibility && visibility !== 'all') {
            conditions.push({ isHidden: visibility === 'hidden' });
        }

        // Add search filter
        if (search) {
            conditions.push({
                OR: [
                    { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { categories: { has: search } },
                    {
                        creator: {
                            OR: [
                                { username: { contains: search, mode: Prisma.QueryMode.insensitive } },
                                { address: { contains: search, mode: Prisma.QueryMode.insensitive } },
                            ]
                        }
                    }
                ]
            });
        }

        const where: Prisma.EventWhereInput = { AND: conditions };

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
        const parsed = AdminEventActionSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid admin action parameters' }, { status: 400 });
        }

        const { eventId, action, value } = parsed.data;

        let updatedEvent;
        if (action === 'toggleHide') {
            if (typeof value !== 'boolean') {
                return NextResponse.json({ error: 'Value must be a boolean for toggleHide' }, { status: 400 });
            }
            updatedEvent = await prisma.event.update({
                where: { id: eventId },
                data: { isHidden: value }
            });
        } else if (action === 'resolve') {
            if (typeof value !== 'string') {
                return NextResponse.json({ error: 'Value must be a string (outcomeId) for resolve' }, { status: 400 });
            }
            // Use the new resolution logic that handles payouts and commissions
            const result = await resolveMarket(eventId, value);
            return NextResponse.json(result);
        } else if (action === 'delete') {
            // Soft-delete the event and clean up related data so it can reappear in intake
            const results = await prisma.$transaction([
                // Delete odds history (prevents stale data on re-import)
                prisma.oddsHistory.deleteMany({
                    where: { eventId },
                }),
                // Delete polymarket mappings so it can reappear in intake
                prisma.polymarketMarketMapping.deleteMany({
                    where: { internalEventId: eventId },
                }),
                // Soft-delete the event
                prisma.event.update({
                    where: { id: eventId },
                    data: {
                        status: 'DELETED',
                        isHidden: true,
                    },
                }),
            ]);
            updatedEvent = results[results.length - 1];
        }

        return NextResponse.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
