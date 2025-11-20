export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const events = await prisma.event.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { bets: true },
                },
            },
        });
        return NextResponse.json(events);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, description, resolutionDate, creatorId } = body;

        // Basic validation
        if (!title || !description || !resolutionDate || !creatorId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Ensure creator exists
        let user = await prisma.user.findUnique({ where: { address: creatorId } });
        if (!user) {
            user = await prisma.user.create({ data: { address: creatorId } });
        }

        const event = await prisma.event.create({
            data: {
                title,
                description,
                resolutionDate: new Date(resolutionDate),
                creatorId: user.id,
            },
        });

        return NextResponse.json(event);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
}
