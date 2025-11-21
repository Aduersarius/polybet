import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q');

        if (!query || query.trim().length === 0) {
            return NextResponse.json({ events: [] });
        }

        const events = await prisma.event.findMany({
            where: {
                OR: [
                    {
                        title: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    },
                    {
                        description: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    },
                    {
                        categories: {
                            has: query,
                        },
                    },
                ],
                status: 'ACTIVE', // Only search active events
            },
            select: {
                id: true,
                title: true,
                categories: true,
                resolutionDate: true,
                imageUrl: true,
            },
            take: 10, // Limit to 10 results
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json({ events });
    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json(
            { error: 'Failed to search events' },
            { status: 500 }
        );
    }
}
