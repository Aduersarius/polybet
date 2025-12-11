import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/user/favorites - List user's favorite events
export async function GET(request: Request) {
    try {
        const user = await requireAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const eventSelect = {
            id: true,
            title: true,
            description: true,
            categories: true,
            resolutionDate: true,
            imageUrl: true,
            status: true,
            type: true,
            outcomes: {
                select: {
                    id: true,
                    name: true,
                    probability: true,
                    color: true
                },
                orderBy: {
                    probability: 'desc'
                }
            }
        } as const;

        const favorites: Prisma.UserFavoriteGetPayload<{ include: { event: { select: typeof eventSelect } } }>[] = await prisma.userFavorite.findMany({
            where: {
                userId: user.id
            },
            include: {
                event: {
                    select: eventSelect
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({
            data: favorites.map(fav => fav.event)
        });
    } catch (error: any) {
        console.error('Get favorites error:', error);
        return NextResponse.json({ error: error.message || 'Failed to get favorites' }, { status: 500 });
    }
}

// POST /api/user/favorites - Add event to favorites
export async function POST(request: Request) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { eventId } = await request.json();

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        // Check if event exists
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, status: true }
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        if (event.status !== 'ACTIVE') {
            return NextResponse.json({ error: 'Cannot favorite inactive event' }, { status: 400 });
        }

        // Check if already favorited
        const existing = await prisma.userFavorite.findUnique({
            where: {
                userId_eventId: {
                    userId: user.id,
                    eventId: eventId
                }
            }
        });

        if (existing) {
            return NextResponse.json({ error: 'Event already in favorites' }, { status: 409 });
        }

        // Add to favorites
        const favorite = await prisma.userFavorite.create({
            data: {
                userId: user.id,
                eventId: eventId
            }
        });

        return NextResponse.json({ success: true, favorite });
    } catch (error: any) {
        console.error('Add favorite error:', error);
        return NextResponse.json({ error: error.message || 'Failed to add favorite' }, { status: 500 });
    }
}

// DELETE /api/user/favorites - Remove event from favorites
export async function DELETE(request: Request) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        // Remove from favorites
        const result = await prisma.userFavorite.deleteMany({
            where: {
                userId: user.id,
                eventId: eventId
            }
        });

        if (result.count === 0) {
            return NextResponse.json({ error: 'Event not in favorites' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Remove favorite error:', error);
        return NextResponse.json({ error: error.message || 'Failed to remove favorite' }, { status: 500 });
    }
}