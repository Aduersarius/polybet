
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
        const session = await requireAuth(request);

        const { id } = await params;
        const body = await request.json();
        const { type } = body; // type: 'LIKE' | 'DISLIKE'

        if (!type) {
            return NextResponse.json({ error: 'Missing type field' }, { status: 400 });
        }

        const userId = session.user.id;

        const messageId = id;

        // Check existing reaction
        const existingReaction = await prisma.messageReaction.findUnique({
            where: {
                userId_messageId: {
                    userId,
                    messageId
                }
            }
        });

        if (existingReaction) {
            if (existingReaction.type === type) {
                // Remove if same type (toggle off)
                await prisma.messageReaction.delete({
                    where: { id: existingReaction.id }
                });
                return NextResponse.json({ status: 'removed' });
            } else {
                // Update if different type
                await prisma.messageReaction.update({
                    where: { id: existingReaction.id },
                    data: { type }
                });
                return NextResponse.json({ status: 'updated' });
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
            return NextResponse.json({ status: 'created' });
        }

    } catch (error) {
        console.error('Error reacting to message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
