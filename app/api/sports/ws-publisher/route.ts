import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { calculateHybridOdds, getInternalOrderVolume } from '@/lib/hybrid-odds';

let publishInterval: NodeJS.Timeout | null = null;
let isPublishing = false;

// Start the publisher
export async function POST(request: Request) {
  if (publishInterval) {
    return NextResponse.json({ 
      status: 'already_running',
      message: 'Sports odds publisher is already running'
    });
  }

  console.log('🚀 Starting sports odds WebSocket publisher (500ms interval)');
  isPublishing = true;

  const publishOdds = async () => {
    if (!isPublishing) return;

    try {
      // Fetch live and upcoming sports events
      const events = await prisma.event.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { isEsports: true },
            { sport: { not: null } },
          ],
          eventType: { in: ['live', 'upcoming'] },
          gameStatus: { notIn: ['finished', 'cancelled'] },
          teamA: { not: null, notIn: ['Team A', 'Team B', ''] },
          teamB: { not: null, notIn: ['Team A', 'Team B', ''] },
        },
        orderBy: [
          { live: 'desc' },
          { startTime: 'asc' },
        ],
        take: 200,
        select: {
          id: true,
          title: true,
          yesOdds: true,
          noOdds: true,
          score: true,
          period: true,
          elapsed: true,
          live: true,
          gameStatus: true,
          sport: true,
          league: true,
          teamA: true,
          teamB: true,
          externalVolume: true,
          startTime: true,
          isEsports: true,
        },
      });

      if (events.length === 0) {
        console.log('📊 No sports events to publish');
        return;
      }

      // Calculate hybrid odds for each event
      const eventsWithOdds = await Promise.all(
        events.map(async (event: typeof events[0]) => {
          if (!event.yesOdds || !event.noOdds) return event;

          try {
            const { yesVolume, noVolume } = await getInternalOrderVolume(prisma, event.id);
            
            const hybrid = calculateHybridOdds({
              polymarketYes: event.yesOdds,
              polymarketNo: event.noOdds,
              ourYesVolume: yesVolume,
              ourNoVolume: noVolume,
              polymarketLiquidity: event.externalVolume || 1000000,
            });
            
            return { 
              ...event, 
              yesOdds: hybrid.yes, 
              noOdds: hybrid.no,
              oddsSource: hybrid.source 
            };
          } catch (error) {
            console.error(`Error calculating odds for event ${event.id}:`, error);
            return event;
          }
        })
      );

      // Group events by sport for targeted broadcasting
      const eventsBySport = eventsWithOdds.reduce((acc, event) => {
        const sport = event.sport || 'other';
        if (!acc[sport]) acc[sport] = [];
        acc[sport].push(event);
        return acc;
      }, {} as Record<string, any[]>);

      // Publish to Redis
      const payload = {
        timestamp: new Date().toISOString(),
        events: eventsWithOdds,
        eventsBySport,
        count: eventsWithOdds.length
      };

      if (redis) {
        await redis.publish('sports-odds', JSON.stringify(payload));
        console.log(`📡 Published ${eventsWithOdds.length} sports odds updates`);
      } else {
        console.error('❌ Redis not available');
      }
    } catch (error) {
      console.error('❌ Error publishing sports odds:', error);
    }
  };

  // Run immediately first time
  await publishOdds();

  // Then run every 500ms
  publishInterval = setInterval(publishOdds, 500);

  return NextResponse.json({ 
    status: 'started', 
    interval: '500ms',
    message: 'Sports odds publisher started successfully'
  });
}

// Stop the publisher
export async function DELETE() {
  if (publishInterval) {
    clearInterval(publishInterval);
    publishInterval = null;
    isPublishing = false;
    console.log('🛑 Stopped sports odds WebSocket publisher');
    return NextResponse.json({ 
      status: 'stopped',
      message: 'Sports odds publisher stopped successfully'
    });
  }
  return NextResponse.json({ 
    status: 'not_running',
    message: 'Publisher was not running'
  });
}

// Check status
export async function GET() {
  return NextResponse.json({ 
    status: publishInterval ? 'running' : 'stopped',
    interval: publishInterval ? '500ms' : null,
    isPublishing
  });
}

