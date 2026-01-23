
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Authentication check
        const user = await requireAuth(request);
        const userId = user.id;

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                type: true,
                message: true,
                resourceId: true,
                isRead: true,
                createdAt: true,
                metadata: true,
            }
        });

        const unreadCount = await prisma.notification.count({
            where: {
                userId,
                isRead: false
            }
        });

        // Enrich notifications with event slugs
        const eventIds = notifications
            .filter((n: any) => n.resourceId && (n.type === 'BET_RESULT' || n.type === 'FAVORITE_UPDATE' || n.type === 'MENTION'))
            .map((n: any) => n.resourceId as string);

        let slugMap: Record<string, string | null> = {};
        if (eventIds.length > 0) {
            const events = await prisma.event.findMany({
                where: { id: { in: eventIds } },
                select: { id: true, slug: true }
            });
            slugMap = events.reduce((acc: Record<string, string | null>, e: any) => ({ ...acc, [e.id]: e.slug }), {});
        }

        const enrichedNotifications = notifications.map((n: any) => ({
            ...n,
            resourceSlug: n.resourceId ? slugMap[n.resourceId] : null
        }));

        return NextResponse.json({ notifications: enrichedNotifications, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        // Authentication check
        assertSameOrigin(request);
        const user = await requireAuth(request);

        const body = await request.json();
        const { notificationId } = body;

        if (!notificationId) {
            return NextResponse.json({ error: 'Notification ID required' }, { status: 400 });
        }

        // Ensure user can only update their own notifications
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
            select: { userId: true }
        });

        if (!notification || notification.userId !== user.id) {
            return NextResponse.json({ error: 'Notification not found or access denied' }, { status: 404 });
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
