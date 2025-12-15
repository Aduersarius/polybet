import { NextRequest, NextResponse } from 'next/server';
import { generateHistoricalOdds } from '@/lib/amm-server';
import { prisma } from '@/lib/prisma';

// Generate mock historical data for Polymarket events
function generateMockHistory(period: string, currentProbs: Record<string, number>) {
    const now = Date.now();
    const points: any[] = [];
    
    // Determine time range
    let durationMs = 24 * 60 * 60 * 1000; // default 24h
    if (period === '6h') durationMs = 6 * 60 * 60 * 1000;
    else if (period === '1d') durationMs = 24 * 60 * 60 * 1000;
    else if (period === '1w') durationMs = 7 * 24 * 60 * 60 * 1000;
    else if (period === '1m') durationMs = 30 * 24 * 60 * 60 * 1000;
    else if (period === '3m') durationMs = 90 * 24 * 60 * 60 * 1000;
    else if (period === 'all') durationMs = 90 * 24 * 60 * 60 * 1000;
    
    const numPoints = 100;
    const step = durationMs / numPoints;
    
    // Generate historical points with slight variation
    for (let i = 0; i < numPoints; i++) {
        const timestamp = now - durationMs + (i * step);
        const progress = i / numPoints;
        
        const point: any = { timestamp };
        
        // For each outcome, create a slightly varying history that trends toward current value
        Object.entries(currentProbs).forEach(([key, currentValue]) => {
            // Start from a value slightly different from current
            const startValue = currentValue * (0.7 + Math.random() * 0.3);
            // Gradually move toward current value with some noise
            const value = startValue + (currentValue - startValue) * progress + (Math.random() - 0.5) * 0.05;
            point[key] = Math.max(0, Math.min(1, value));
        });
        
        points.push(point);
    }
    
    // Add final point with exact current values
    points.push({ timestamp: now, ...currentProbs });
    
    return points;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: eventId } = await params;
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || '24h';

        // Check if this is a local database event
        const localEvent = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true }
        });

        if (localEvent) {
            // Use real historical odds for local events
            const oddsHistory = await generateHistoricalOdds(eventId, period);
            return NextResponse.json({
                eventId,
                period,
                data: oddsHistory,
            });
        }

        // For Polymarket events, fetch current data and generate mock history
        const polymarketRes = await fetch(`http://localhost:3000/api/polymarket/markets?id=${eventId}&limit=1`);
        if (!polymarketRes.ok) {
            return NextResponse.json({ eventId, period, data: [] });
        }

        const polymarketData = await polymarketRes.json();
        const event = polymarketData[0];
        
        if (!event) {
            return NextResponse.json({ eventId, period, data: [] });
        }

        // Build current probabilities object
        const currentProbs: Record<string, number> = {};
        
        if (event.type === 'BINARY') {
            currentProbs.yesPrice = event.yesOdds || 0.5;
        } else if (event.type === 'MULTIPLE' && event.outcomes) {
            event.outcomes.forEach((outcome: any) => {
                currentProbs[`outcome_${outcome.id}`] = outcome.probability || 0;
            });
        }

        const mockHistory = generateMockHistory(period, currentProbs);

        return NextResponse.json({
            eventId,
            period,
            data: mockHistory,
        });
    } catch (error) {
        console.error('Error fetching odds history:', error);
        return NextResponse.json(
            { error: 'Failed to fetch odds history' },
            { status: 500 }
        );
    }
}