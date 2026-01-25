import { NextRequest, NextResponse } from 'next/server';
import { getOrderBook } from '@/lib/hybrid-trading';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const option = searchParams.get('option');     // 'YES' | 'NO'
    const outcomeId = searchParams.get('outcomeId'); // UUID

    const targetOption = option || outcomeId;

    if (!eventId || !targetOption) {
        return NextResponse.json({
            error: 'Missing required parameters: eventId and either option or outcomeId'
        }, { status: 400 });
    }

    // For binary markets, we accept 'YES', 'NO', or the raw outcome ID
    // The validation is handled in the library based on whether the ID exists.

    try {
        // Correctly use the targetOption (which could be a UUID now)
        const orderOption = targetOption;

        // Try to get from cache first
        const cacheKey = `orderbook:${eventId}:${orderOption}`;
        let orderbook;

        if (redis && (redis as any).status === 'ready') {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    orderbook = JSON.parse(cached);
                }
            } catch (error: any) {
                // Silently fail on cache read errors
            }
        }

        // If not cached, fetch from database (uses dynamic fake orders from hybrid-trading)
        if (!orderbook) {
            orderbook = await getOrderBook(eventId, orderOption);

            // Cache for shorter time (e.g., 2s) because prices move dynamically now
            if (redis && (redis as any).status === 'ready') {
                try {
                    await redis.setex(cacheKey, 5, JSON.stringify(orderbook));
                } catch (error: any) {
                    // Silently fail on cache write errors
                }
            }
        }

        return NextResponse.json(orderbook);

    } catch (error) {
        console.error('Error fetching orderbook:', error);
        return NextResponse.json({
            error: 'Failed to fetch orderbook'
        }, { status: 500 });
    }
}