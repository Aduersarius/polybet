import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    try {
        const { prisma } = await import('@/lib/prisma');
        const { id } = await params;

        const queryPromise = prisma.event.findUnique({
            where: { id },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        address: true,
                    },
                },
            },
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database query timeout')), 8000);
        });

        const event = await Promise.race([queryPromise, timeoutPromise]);

        if (!event) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        const queryTime = Date.now() - startTime;
        console.log(`✅ Event ${id} fetched in ${queryTime}ms`);

        return NextResponse.json(event);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Event fetch failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json(
            { error: 'Failed to fetch event' },
            { status: 500 }
        );
    }
}
