
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15; // 15 second timeout for Vercel

export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    try {
        const { prisma } = await import('@/lib/prisma');
        const where = category ? { categories: { has: category } } : {};

        // Simplified query without joins for faster performance
        const queryPromise = prisma.event.findMany({
            where: {
                ...where,
                status: 'ACTIVE' // Only active events
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                categories: true,
                resolutionDate: true,
                imageUrl: true,
                createdAt: true,
            },
            take: 20, // Smaller limit for speed
        });

        // Shorter timeout for faster failure
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database query timeout')), 3000);
        });

        const events = await Promise.race([queryPromise, timeoutPromise]) as any[];
        const queryTime = Date.now() - startTime;

        console.log(`✅ Events API: ${events.length} events in ${queryTime}ms`);

        return NextResponse.json(events);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Events API failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json({
            error: 'Failed to fetch events',
            message: error instanceof Error ? error.message : String(error),
            queryTime: `${Date.now() - startTime}ms`
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { prisma } = await import('@/lib/prisma');
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

