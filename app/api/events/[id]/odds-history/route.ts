import { NextRequest, NextResponse } from 'next/server';
import { generateHistoricalOdds } from '@/lib/amm-server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: eventId } = await params;
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || '24h';

        // Generate historical odds data
        const oddsHistory = await generateHistoricalOdds(eventId, period);

        return NextResponse.json({
            eventId,
            period,
            data: oddsHistory,
        });
    } catch (error) {
        console.error('Error fetching odds history:', error);
        return NextResponse.json(
            { error: 'Failed to fetch odds history' },
            { status: 500 }
        );
    }
}