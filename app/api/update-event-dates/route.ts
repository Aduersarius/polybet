import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
    try {
        const events = await prisma.event.findMany();

        const now = new Date();
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        for (const event of events) {
            // Random creation time between 3 months ago and 1 month ago
            const randomCreatedAt = new Date(
                threeMonthsAgo.getTime() + Math.random() * (oneMonthAgo.getTime() - threeMonthsAgo.getTime())
            );

            await prisma.event.update({
                where: { id: event.id },
                data: { createdAt: randomCreatedAt },
            });
        }

        return NextResponse.json({
            success: true,
            message: `Updated ${events.length} events with random creation dates`
        });
    } catch (error) {
        console.error('Error updating event dates:', error);
        return NextResponse.json(
            { error: 'Failed to update event dates' },
            { status: 500 }
        );
    }
}
