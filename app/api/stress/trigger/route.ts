import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// Initialize Redis client
// NOTE: In production, ensure REDIS_URL is set in Vercel env vars
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

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

        // Publish to the channel the VPS is listening to
        await redis.publish('event-updates', JSON.stringify(payload));

        return NextResponse.json({ success: true, payload });
    } catch (error) {
        console.error('Stress trigger error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
