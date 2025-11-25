
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        const unreadCount = await prisma.notification.count({
            where: {
                userId,
                isRead: false
            }
        });

        return NextResponse.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { notificationId } = body;

        if (!notificationId) {
            return NextResponse.json({ error: 'Notification ID required' }, { status: 400 });
        }

        await prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating notification:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
