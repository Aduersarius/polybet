import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const maxDuration = 10; // 10s timeout
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { eventId, price, timestamp } = body;

        if (!eventId) {
            return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
        }

        // Payload matching what the VPS expects
        const payload = {
            eventId,
            yesPrice: price || Math.random(),
            timestamp: timestamp || Date.now(),
        };

        // Publish with timeout
        if (redis) {
            console.log(`[Trigger] Publishing to event-updates for ${eventId}`);

            // Race condition to prevent hanging
            const publishPromise = redis.publish('event-updates', JSON.stringify(payload));
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Redis publish timeout')), 3000)
            );

            await Promise.race([publishPromise, timeoutPromise]);
            console.log(`[Trigger] Published successfully`);
        } else {
            console.warn('[Trigger] Redis not available');
        }

        return NextResponse.json({ success: true, payload });
    } catch (error) {
        console.error('Stress trigger error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
