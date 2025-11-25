import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id } = await params;

        console.log(`[API] Fetching messages for event: ${id}`);

        // Use Redis caching with 20s TTL
        const formattedMessages = await getOrSet(
            `${id}:messages`,
            async () => {
                const messages = await prisma.message.findMany({
                    where: { eventId: id },
                    include: {
                        user: {
                            select: {
                                username: true,
                                avatarUrl: true,
                                address: true,
                                bets: {
                                    where: { eventId: id },
                                    select: {
                                        option: true,
                                        amount: true
                                    }
                                }
                            }
                        },
                        reactions: {
                            include: {
                                user: { select: { address: true } }
                            }
                        },
                        replies: { select: { id: true } }
                    },
                    orderBy: { createdAt: 'asc' },
                });

                // Transform for frontend
                return messages.map((msg: any) => ({
                    ...msg,
                    replyCount: msg.replies.length,
                    reactions: msg.reactions.reduce((acc: Record<string, string[]>, r: any) => {
                        if (!acc[r.type]) acc[r.type] = [];
                        acc[r.type].push(r.user.address);
                        return acc;
                    }, {} as Record<string, string[]>)
                }));
            },
            { ttl: 20, prefix: 'event' }
        );

        return NextResponse.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        // Mock auth for dev
        const userId = 'dev-user';
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { text, parentId } = body;
        console.log(`[API] Posting message for event: ${id}, user: ${userId}, text: ${text}`);

        if (!text) {
            return NextResponse.json({ error: 'Missing text field' }, { status: 400 });
        }

        // Get or create user
        let user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user && userId === 'dev-user') {
            user = await prisma.user.create({
                data: {
                    id: 'dev-user',
                    username: 'Dev User',
                    address: '0xDevUser',
                    clerkId: 'dev-user-clerk-id'
                }
            });
        }

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const message = await prisma.message.create({
            data: {
                text,
                userId: user.id,
                eventId: id,
                parentId: parentId || null
            },
            include: {
                user: {
                    select: {
                        username: true,
                        avatarUrl: true,
                        address: true
                    }
                }
            }
        });

        // Handle Notifications
        if (parentId) {
            const parentMsg = await prisma.message.findUnique({
                where: { id: parentId },
                select: { userId: true }
            });
            if (parentMsg && parentMsg.userId !== user.id) {
                await prisma.notification.create({
                    data: {
                        userId: parentMsg.userId,
                        type: 'REPLY',
                        message: `${user.username || 'Someone'} replied to your message`,
                        resourceId: id
                    }
                });
            }
        }

        const mentionMatch = text.match(/@(\w+)/);
        if (mentionMatch) {
            const mentionedUsername = mentionMatch[1];
            const mentionedUser = await prisma.user.findFirst({
                where: { username: mentionedUsername }
            });

            if (mentionedUser && mentionedUser.id !== user.id) {
                await prisma.notification.create({
                    data: {
                        userId: mentionedUser.id,
                        type: 'MENTION',
                        message: `${user.username || 'Someone'} mentioned you`,
                        resourceId: id
                    }
                });
            }
        }

        // Publish to Redis for WebSocket Server
        const messagePayload = {
            ...message,
            replyCount: 0,
            reactions: {}
        };
        if (redis) {
            await redis.publish('chat-messages', JSON.stringify(messagePayload));
        }

        // Invalidate messages cache for this event
        const { invalidate } = await import('@/lib/cache');
        await invalidate(`${id}:messages`, 'event');
        console.log(`🗑️ Invalidated messages cache for event: ${id}`);

        return NextResponse.json(message);
    } catch (error) {
        console.error('Error posting message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
