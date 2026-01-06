import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        await requireAdminAuth(request);

        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
        const before = searchParams.get('before');

        const whereClause = before
            ? { createdAt: { lt: new Date(before) } }
            : {};

        const orders = await prisma.order.findMany({
            where: whereClause,
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                },
                event: {
                    select: {
                        title: true,
                        status: true,
                        result: true
                    }
                },
                outcome: {
                    select: {
                        name: true
                    }
                },
                hedgePosition: true,
                polyOrder: true
            },
            orderBy: { createdAt: 'desc' },
            take: limit + 1
        });

        const hasMore = orders.length > limit;
        const pageOrders = orders.slice(0, limit);
        const nextCursor = hasMore ? pageOrders[pageOrders.length - 1].createdAt.toISOString() : null;

        const formattedHedges = pageOrders.map((order) => {
            const hedge = order.hedgePosition;
            const poly = order.polyOrder;

            return {
                id: order.id,
                userId: order.userId,
                username: order.user.username || order.user.email,
                eventId: order.eventId,
                eventTitle: order.event.title,
                amount: Number(order.amount),
                side: order.side.toUpperCase(),
                price: Number(order.price),
                option: order.outcome?.name || order.option || 'Unknown',
                createdAt: order.createdAt.toISOString(),
                status: order.status.toUpperCase(),
                hedge: hedge ? {
                    status: hedge.status,
                    price: Number(hedge.hedgePrice),
                    spread: Number(hedge.spreadCaptured),
                    netProfit: Number(hedge.netProfit),
                    failureReason: hedge.failureReason,
                    polymarketOrderId: hedge.polymarketOrderId,
                    hedgedAt: hedge.hedgedAt?.toISOString()
                } : null,
                poly: poly ? {
                    status: poly.status,
                    amountFilled: Number(poly.amountFilled),
                    error: poly.error
                } : null
            };
        });

        return NextResponse.json({
            hedges: formattedHedges,
            hasMore,
            nextCursor
        });
    } catch (error) {
        console.error('Error fetching admin hedge records:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
