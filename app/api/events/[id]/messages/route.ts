import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limiting
    const { apiLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
    const identifier = getRateLimitIdentifier(request);
    const rateLimitResponse = await checkRateLimit(apiLimiter, identifier);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50); // Default 10, max 50
        const cursor = searchParams.get('cursor'); // For pagination
        const before = searchParams.get('before'); // Load messages before this ID

        console.log(`[API] Fetching messages for event: ${id}, limit: ${limit}, cursor: ${cursor}`);

        // Create cache key that includes pagination params
        const cacheKey = `${id}:messages:${limit}:${cursor || 'latest'}:${before || 'none'}`;

        // Use Redis caching with pagination-aware key
        const result = await getOrSet(
            cacheKey,
            async () => {
                const whereClause: any = {
                    eventId: id,
                    isDeleted: false
                };

                // Add cursor-based pagination
                if (cursor) {
                    whereClause.createdAt = { lt: new Date(cursor) };
                }

                // Alternative: load messages before a specific message ID
                if (before) {
                    const beforeMessage = await prisma.message.findUnique({
                        where: { id: before },
                        select: { createdAt: true }
                    });
                    if (beforeMessage) {
                        whereClause.createdAt = { lt: beforeMessage.createdAt };
                    }
                }

                const messages = await prisma.message.findMany({
                    where: whereClause,
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
                    orderBy: { createdAt: 'desc' }, // Most recent first for lazy loading
                    take: limit + 1, // Take one extra to check if there are more
                });

                const hasMore = messages.length > limit;
                const messagesToReturn = hasMore ? messages.slice(0, limit) : messages;

                // Transform for frontend
                const formattedMessages = messagesToReturn.map((msg: any) => ({
                    ...msg,
                    replyCount: msg.replies.length,
                    reactions: msg.reactions.reduce((acc: Record<string, string[]>, r: any) => {
                        if (!acc[r.type]) acc[r.type] = [];
                        acc[r.type].push(r.user.address);
                        return acc;
                    }, {} as Record<string, string[]>)
                }));

                return {
                    messages: formattedMessages,
                    hasMore,
                    nextCursor: hasMore && messagesToReturn.length > 0
                        ? messagesToReturn[messagesToReturn.length - 1].createdAt.toISOString()
                        : null
                };
            },
            { ttl: 60, prefix: 'event' } // 1 minute cache for paginated results
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    // Rate limiting - use heavy limiter for message posting
    const { heavyLimiter, getRateLimitIdentifier, checkRateLimit } = await import('@/lib/ratelimit');
    const identifier = getRateLimitIdentifier(req);
    const rateLimitResponse = await checkRateLimit(heavyLimiter, identifier);
    if (rateLimitResponse) return rateLimitResponse;

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

        // Invalidate all message caches for this event (pagination-aware)
        const { invalidatePattern } = await import('@/lib/cache');
        await invalidatePattern(`event:${id}:messages:*`);
        console.log(`🗑️ Invalidated all message caches for event: ${id}`);

        return NextResponse.json(message);
    } catch (error) {
        console.error('Error posting message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
