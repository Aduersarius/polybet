
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Authentication check
        const user = await requireAuth(request);

        const { id } = await params;
        const body = await request.json();
        const { type } = body; // type: 'LIKE' | 'DISLIKE'

        if (!type) {
            return NextResponse.json({ error: 'Missing type field' }, { status: 400 });
        }

        const userId = user.id;

        const messageId = id;

        // We need the parent message to know which event to notify via WebSocket
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            select: { eventId: true },
        });

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Check existing reaction
        const existingReaction = await prisma.messageReaction.findUnique({
            where: {
                userId_messageId: {
                    userId,
                    messageId
                }
            }
        });

        let status: 'created' | 'updated' | 'removed';

        if (existingReaction) {
            if (existingReaction.type === type) {
                // Remove if same type (toggle off)
                await prisma.messageReaction.delete({
                    where: { id: existingReaction.id }
                });
                status = 'removed';
            } else {
                // Update if different type
                await prisma.messageReaction.update({
                    where: { id: existingReaction.id },
                    data: { type }
                });
                status = 'updated';
            }
        } else {
            // Create new
            await prisma.messageReaction.create({
                data: {
                    userId,
                    messageId,
                    type
                }
            });
            status = 'created';
        }

        // Invalidate cached messages for this event so refetch returns fresh reactions
        try {
            const { invalidatePattern } = await import('@/lib/cache');
            await invalidatePattern(`event:${message.eventId}:messages:*`);
        } catch (cacheError) {
            console.error('Error invalidating message cache after reaction:', cacheError);
            // Non-fatal; UI will still eventually update when cache expires
        }

        // Publish a lightweight reaction event via Redis so WebSocket clients can refresh
        try {
            const { redis } = await import('@/lib/redis');
            if (redis) {
                const payload = {
                    eventId: message.eventId,
                    reaction: {
                        messageId,
                        type,
                        status,
                    },
                };

                // Use same channel as chat messages so the WS bridge can treat them uniformly
                await redis.publish('chat-messages', JSON.stringify(payload));
            }
        } catch (pubError) {
            console.error('Error publishing reaction event:', pubError);
            // Do not fail the request if publishing to Redis fails
        }

        return NextResponse.json({ status });

    } catch (error) {
        console.error('Error reacting to message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
