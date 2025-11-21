import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const messages = await prisma.message.findMany({
            where: {
                eventId: id
            },
            include: {
                user: {
                    select: {
                        address: true,
                        username: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return NextResponse.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
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
                        username: true
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
