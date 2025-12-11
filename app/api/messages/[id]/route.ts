import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH - Edit message
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Authentication check
        assertSameOrigin(request);
        const user = await requireAuth(request);

        const { id } = await params;
        const body = await request.json();
        const { text } = body;

        if (!text) {
            return NextResponse.json({ error: 'Missing text field' }, { status: 400 });
        }

        // Find the message
        const message = await prisma.message.findUnique({
            where: { id },
            include: { user: true }
        });

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Verify ownership
        if (message.userId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Update message
        const updatedMessage = await prisma.message.update({
            where: { id },
            data: {
                text,
                editedAt: new Date()
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

        return NextResponse.json(updatedMessage);
    } catch (error) {
        console.error('Error updating message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete message (soft if has replies)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Authentication check
        assertSameOrigin(request);
        const user = await requireAuth(request);

        const { id } = await params;

        // Find the message with user and replies
        const message = await prisma.message.findUnique({
            where: { id },
            include: {
                user: true,
                replies: { select: { id: true } }
            }
        });

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Verify ownership
        if (message.userId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // If has replies, soft delete
        if (message.replies.length > 0) {
            await prisma.message.update({
                where: { id },
                data: { isDeleted: true }
            });
            return NextResponse.json({ status: 'soft_deleted' });
        }

        // Otherwise, hard delete
        await prisma.message.delete({
            where: { id }
        });

        return NextResponse.json({ status: 'deleted' });
    } catch (error) {
        console.error('Error deleting message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
