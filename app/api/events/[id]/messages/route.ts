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
        const { id } = await params;
        console.log(`[API] Fetching messages for event: ${id}`);
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
        const formattedMessages = messages.map((msg: any) => ({
            ...msg,
            replyCount: msg.replies.length,
            reactions: msg.reactions.reduce((acc: Record<string, string[]>, r: any) => {
                if (!acc[r.type]) acc[r.type] = [];
                acc[r.type].push(r.user.address);
                return acc;
            }, {} as Record<string, string[]>)
        }));

        return NextResponse.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { auth } = await import('@clerk/nextjs/server');
        const { userId: clerkUserId } = await auth();

        if (!clerkUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { text, parentId } = body;
        console.log(`[API] Posting message for event: ${id}, user: ${clerkUserId}, text: ${text}`);

        if (!text) {
            return NextResponse.json({ error: 'Missing text field' }, { status: 400 });
        }

        // Get or create user with Clerk ID
        let user = await prisma.user.findUnique({
            where: { clerkId: clerkUserId }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    clerkId: clerkUserId,
                    // Additional user data can be populated from Clerk if needed
                }
            });
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
        await redis.publish('chat-messages', JSON.stringify(messagePayload));

        return NextResponse.json(message);
    } catch (error) {
        console.error('Error posting message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
