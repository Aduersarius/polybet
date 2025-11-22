import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH - Edit message
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { text, address } = body;

        if (!text || !address) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
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
        if (message.user.address.toLowerCase() !== address.toLowerCase()) {
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
        const { id } = await params;
        const body = await request.json();
        const { address } = body;

        if (!address) {
            return NextResponse.json({ error: 'Missing address' }, { status: 400 });
        }

        // Find the message with replies
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
        if (message.user.address.toLowerCase() !== address.toLowerCase()) {
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
