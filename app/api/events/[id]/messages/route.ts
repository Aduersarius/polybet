import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { sanitizeText } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id: rawId } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50); // Default 10, max 50
        const cursor = searchParams.get('cursor'); // For pagination
        const before = searchParams.get('before'); // Load messages before this ID

        // Resolve internal event ID if a slug or polymarket ID was provided
        let eventId = rawId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
        if (!isUUID) {
            const event = await prisma.event.findFirst({
                where: {
                    OR: [
                        { slug: rawId },
                        { polymarketId: rawId }
                    ]
                },
                select: { id: true }
            });
            if (event) {
                eventId = event.id;
            }
        }

        console.log(`[API] Fetching messages for event: ${eventId} (raw: ${rawId}), limit: ${limit}, cursor: ${cursor}`);

        // Create cache key that includes pagination params - use eventId (resolved) for consistency
        const cacheKey = `${eventId}:messages:${limit}:${cursor || 'latest'}:${before || 'none'}`;

        // Use Redis caching with pagination-aware key
        const result = await getOrSet(
            cacheKey,
            async () => {
                const whereClause: any = {
                    eventId: eventId,
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
                                image: true, // Include image field from Better Auth as fallback
                                address: true,
                                marketActivity: {
                                    where: { eventId: eventId },
                                    select: {
                                        option: true,
                                        amount: true
                                    }
                                }
                            } as any
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
                    user: {
                        ...msg.user,
                        // Ensure image field is included
                        image: msg.user.image || null,
                        avatarUrl: msg.user.avatarUrl || null,
                        // Flatten market activity into a simple bets array for the UI
                        bets: (msg.user.marketActivity || []).map((bet: any) => ({
                            option: bet.option,
                            amount: Number(bet.amount),
                        })),
                    },
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
        return createErrorResponse(error);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const startTime = Date.now();

    try {
        assertSameOrigin(req);
        // Authentication check
        const user = await requireAuth(req);
        const userId = user.id;

        const { id: rawId } = await params;

        // Resolve internal event ID if a slug or polymarket ID was provided
        let eventId = rawId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
        if (!isUUID) {
            const event = await prisma.event.findFirst({
                where: {
                    OR: [
                        { slug: rawId },
                        { polymarketId: rawId }
                    ]
                },
                select: { id: true }
            });
            if (event) {
                eventId = event.id;
            }
        }

        // Validate event ID (supports both UUID and Polymarket numeric IDs)
        // Note: [id] parameter is not validated via regex here anymore to stay flexible with proxy IDs
        if (!eventId || eventId.length < 1) {
            return createClientErrorResponse('Invalid event ID', 400);
        }

        const body = await req.json();

        // Validate message using centralized schema
        const { MessageRequestSchema } = await import('@/lib/validation');
        const parsed = MessageRequestSchema.safeParse(body);

        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            const pathPrefix = firstError.path.length > 0 ? `${firstError.path.join('.')}: ` : '';
            return createClientErrorResponse(`${pathPrefix}${firstError.message}`, 400);
        }

        const { text: rawText, parentId } = parsed.data;

        // Sanitize text to prevent XSS (consistent with support ticket messages)
        const text = sanitizeText(rawText);

        // Helper for query timeout protection
        const withTimeout = <T>(promise: Promise<T>, ms: number = 3000): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Query timeout')), ms)
                )
            ]);
        };

        // OPTIMIZATION: Use upsert for atomic user find-or-create
        const upsertedUser = await withTimeout(
            prisma.user.upsert({
                where: { id: userId },
                update: {}, // No updates if exists
                create: {
                    id: userId,
                    username: user.name || `User_${userId.slice(-8)}`,
                    email: user.email,
                    address: `0x${userId.slice(-8)}`
                }
            }),
            5000
        );

        const message = await withTimeout<Awaited<ReturnType<typeof prisma.message.create>>>(
            prisma.message.create({
                data: {
                    text,
                    userId: user.id,
                    eventId: eventId,
                    parentId: parentId || null
                },
                include: {
                    user: {
                        select: {
                            username: true,
                            avatarUrl: true,
                            image: true, // Include image field from Better Auth as fallback
                            address: true
                        }
                    }
                }
            }),
            5000
        );

        // Handle Notifications (with timeout)
        if (parentId) {
            withTimeout(
                (async () => {
                    const parentMsg = await prisma.message.findUnique({
                        where: { id: parentId },
                        include: { user: true }
                    });

                    if (parentMsg && parentMsg.userId !== user.id) {
                        await prisma.notification.create({
                            data: {
                                userId: parentMsg.userId,
                                type: 'REPLY',
                                message: `${user.name || 'Someone'} replied to your message`,
                                resourceId: eventId
                            }
                        });
                    }
                })(),
                3000
            ).catch(err => console.error('Notification failed:', err)); // Non-blocking
        }

        // Publish to WebSocket (non-blocking)
        const { redis } = await import('@/lib/redis');
        const messagePayload = {
            eventId: eventId,
            message: {
                id: message.id,
                text: message.text,
                userId: message.userId,
                username: message.user.username,
                avatarUrl: message.user.avatarUrl || message.user.image,
                address: message.user.address,
                createdAt: message.createdAt,
                parentId: message.parentId,
                reactions: {}
            }
        };

        if (redis) {
            redis.publish('chat-messages', JSON.stringify(messagePayload))
                .catch(err => console.error('Redis publish failed:', err));
        }

        // Also publish to Pusher (Soketi) for Frontend
        try {
            const { getPusherServer } = await import('@/lib/pusher-server');
            const pusherServer = getPusherServer();
            await pusherServer.trigger(`event-${eventId}`, 'chat-message', messagePayload);
            console.log(`✅ [API] Message published to Pusher/Soketi for event ${eventId}`);
        } catch (pusherErr) {
            console.error('❌ [API] Pusher publish failed:', pusherErr);
        }

        // OPTIMIZATION: Minimal cache invalidation - only this event's messages
        const { invalidatePattern } = await import('@/lib/cache');
        await invalidatePattern(`${eventId}:messages:*`);
        await invalidatePattern(`${rawId}:messages:*`); // Also invalidate by slug just in case

        const totalTime = Date.now() - startTime;
        console.log(`✅ Message posted for event ${eventId} (${totalTime}ms)`);

        return NextResponse.json(message);
    } catch (error) {
        if (error instanceof Error && error.message === 'Query timeout') {
            return createClientErrorResponse('Request timed out', 504);
        }
        return createErrorResponse(error);
    }
}
