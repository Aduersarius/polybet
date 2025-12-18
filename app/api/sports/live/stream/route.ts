export const runtime = 'nodejs';
import { prisma } from '@/lib/prisma';
import { calculateHybridOdds, getInternalOrderVolume } from '@/lib/hybrid-odds';

/**
 * GET /api/sports/live/stream
 * Server-Sent Events (SSE) endpoint for real-time sports updates with hybrid odds
 * 
 * This endpoint sends live/upcoming sports event updates every 3 seconds
 * Odds are hybrid: Polymarket base + our users' orders
 */
export async function GET(request: Request) {
  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Function to send updates
      const sendUpdate = async () => {
        try {
          // Fetch live and upcoming sports events (not long-term futures)
          const events = await prisma.event.findMany({
            where: {
              status: 'ACTIVE',
              OR: [
                { isEsports: true },
                { sport: { not: null } },
              ],
              eventType: {
                in: ['live', 'upcoming']
              },
            },
            orderBy: [
              { live: 'desc' },
              { startTime: 'asc' },
            ],
            take: 100,
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
              externalVolume: true,
              eventType: true,
              
              outcomes: {
                select: {
                  id: true,
                  name: true,
                  probability: true,
                },
              },
            },
          });
          
          // Calculate hybrid odds for each event
          const eventsWithHybridOdds = await Promise.all(
            events.map(async (event) => {
              // Get our internal order volume
              const { yesVolume, noVolume } = await getInternalOrderVolume(prisma, event.id);
              
              // If we have base odds from Polymarket, calculate hybrid
              if (event.yesOdds && event.noOdds) {
                const hybrid = calculateHybridOdds({
                  polymarketYes: event.yesOdds,
                  polymarketNo: event.noOdds,
                  ourYesVolume: yesVolume,
                  ourNoVolume: noVolume,
                  polymarketLiquidity: event.externalVolume || 1000000, // Default 1M if unknown
                });
                
                return {
                  ...event,
                  yesOdds: hybrid.yes,
                  noOdds: hybrid.no,
                  oddsSource: hybrid.source,
                };
              }
              
              return event;
            })
          );
          
          // Send data as SSE event
          const data = JSON.stringify({
            timestamp: new Date().toISOString(),
            events: eventsWithHybridOdds,
            count: eventsWithHybridOdds.length,
          });
          
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`)
          );
        } catch (error) {
          console.error('[Live Stream] Error fetching updates:', error);
        }
      };
      
      // Send initial update immediately
      await sendUpdate();
      
      // Set up interval for periodic updates (every 3 seconds)
      const interval = setInterval(sendUpdate, 3000);
      
      // Cleanup function
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
      
      // Handle client disconnect
      setTimeout(() => {
        // Keep connection alive for up to 10 minutes
        clearInterval(interval);
        controller.close();
      }, 600000);
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

