
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    try {
        const where = category ? { categories: { has: category } } : {};

        const events = await prisma.event.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                description: true,
                categories: true,
                resolutionDate: true,
                imageUrl: true,
                createdAt: true,
                _count: { select: { bets: true } },
            },
        });
        console.log('First event:', events[0]);
        return NextResponse.json(events);
    } catch (error) {
        console.error('ERROR fetching events:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
        console.error('Error message:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Failed to fetch events', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, description, resolutionDate, creatorId, categories } = body;

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
                categories: categories ?? [],
            },
            select: {
                id: true,
                title: true,
                description: true,
                categories: true,
                resolutionDate: true,
                createdAt: true,
                imageUrl: true,
            },
        });

        return NextResponse.json(event);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
}

