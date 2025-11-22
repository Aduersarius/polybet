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

        const queryPromise = prisma.message.findMany({
            where: { eventId: id },
            include: {
                user: {
                    select: {
                        address: true,
                        username: true,
                        avatarUrl: true,
                        bets: {
                            where: { eventId: id },
                            select: {
                                option: true,
                                amount: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' },
            take: 100 // Limit messages for performance
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database query timeout')), 8000);
        });

        const messages = await Promise.race([queryPromise, timeoutPromise]) as any[];

        const queryTime = Date.now() - startTime;
        console.log(`✅ Messages for event ${id}: ${messages.length} messages in ${queryTime}ms`);

        return NextResponse.json(messages);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Messages fetch failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json(
            { error: 'Failed to fetch messages' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { prisma } = await import('@/lib/prisma');
        const { id } = await params;
        const body = await request.json();
        console.log('POST /api/messages - Body:', body);
        const { text, address } = body;

        if (!text || !address) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Find or create user
        let user = await prisma.user.findUnique({
            where: { address }
        });
        console.log('User found:', user);

        if (!user) {
            user = await prisma.user.create({
                data: { address }
            });
        }

        const message = await prisma.message.create({
            data: {
                text,
                eventId: id,
                userId: user.id
            },
            include: {
                user: {
                    select: {
                        address: true,
                        username: true,
                        avatarUrl: true,
                        bets: {
                            where: { eventId: id },
                            select: {
                                option: true,
                                amount: true
                            }
                        }
                    }
                }
            }
        });

        return NextResponse.json(message);
    } catch (error) {
        console.error('Error creating message:', error);
        // @ts-ignore
        console.error('Error details:', error.message);
        return NextResponse.json(
            { error: 'Failed to create message', details: String(error) },
            { status: 500 }
        );
    }
}
