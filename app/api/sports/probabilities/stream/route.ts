export const runtime = 'nodejs';
import { prisma } from '@/lib/prisma';

const CLOB_API_URL = 'https://clob.polymarket.com';

/**
 * Fetch orderbook mid price for a token
 */
async function fetchOrderbookMid(tokenId: string): Promise<number | null> {
  try {
    const url = `${CLOB_API_URL}/orderbook?token_id=${encodeURIComponent(tokenId)}`;
    const response = await fetch(url, { 
      cache: 'no-store',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const bids = data.bids || [];
    const asks = data.asks || [];
    
    if (bids.length === 0 || asks.length === 0) {
      return null;
    }
    
    const bestBid = parseFloat(bids[0]?.price || bids[0]?.[0] || 0);
    const bestAsk = parseFloat(asks[0]?.price || asks[0]?.[0] || 0);
    
    if (bestBid > 0 && bestAsk > 0) {
      return (bestBid + bestAsk) / 2;
    } else if (bestAsk > 0) {
      return bestAsk;
    } else if (bestBid > 0) {
      return bestBid;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * GET /api/sports/probabilities/stream
 * Server-Sent Events endpoint for real-time sports probability updates
 */
export async function GET(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const sendUpdate = async () => {
        try {
          // 1. Fetch live sports events with Polymarket mappings
          const events = await prisma.event.findMany({
            where: {
              status: 'ACTIVE',
              OR: [
                { isEsports: true },
                { sport: { not: null } },
              ],
            },
            include: {
              polymarketMapping: true,
            },
            take: 100,
            orderBy: {
              live: 'desc',
            },
          });
          
          // 2. Fetch fresh probabilities from Polymarket for events with mappings
          const updates = await Promise.all(
            events.map(async (event) => {
              // If no mapping, use database odds
              if (!event.polymarketMapping || !event.polymarketMapping.yesTokenId || !event.polymarketMapping.noTokenId) {
                return {
                  eventId: event.id,
                  yesOdds: event.yesOdds || 0.5,
                  noOdds: event.noOdds || 0.5,
                  source: 'database',
                  timestamp: Date.now(),
                };
              }
              
              // Fetch from Polymarket
              const [yesMid, noMid] = await Promise.all([
                fetchOrderbookMid(event.polymarketMapping.yesTokenId),
                fetchOrderbookMid(event.polymarketMapping.noTokenId),
              ]);
              
              // Use Polymarket data if available, otherwise fall back to database
              const yesOdds = yesMid !== null ? yesMid : event.yesOdds || 0.5;
              const noOdds = noMid !== null ? noMid : event.noOdds || 0.5;
              
              // Update database with fresh odds
              if (yesMid !== null || noMid !== null) {
                await prisma.event.update({
                  where: { id: event.id },
                  data: {
                    yesOdds: yesMid !== null ? yesMid : undefined,
                    noOdds: noMid !== null ? noMid : undefined,
                    updatedAt: new Date(),
                  },
                }).catch(() => {}); // Silently fail to not block the stream
              }
              
              return {
                eventId: event.id,
                yesOdds,
                noOdds,
                source: yesMid !== null || noMid !== null ? 'polymarket' : 'database',
                timestamp: Date.now(),
              };
            })
          );
          
          // 3. Filter out null updates and send to client
          const validUpdates = updates.filter(u => u !== null);
          
          const data = JSON.stringify({
            updates: validUpdates,
            count: validUpdates.length,
            timestamp: Date.now(),
          });
          
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`)
          );
        } catch (error) {
          console.error('[Sports Probabilities SSE] Error sending update:', error);
          // Send error event but don't close the stream
          const errorData = JSON.stringify({
            error: 'Failed to fetch updates',
            timestamp: Date.now(),
          });
          controller.enqueue(
            encoder.encode(`data: ${errorData}\n\n`)
          );
        }
      };
      
      // Send initial update immediately
      await sendUpdate();
      
      // Set up interval for periodic updates (every 3 seconds)
      const interval = setInterval(sendUpdate, 3000);
      
      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
      
      // Auto-close after 10 minutes to prevent zombie connections
      setTimeout(() => {
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
      'X-Accel-Buffering': 'no',
    },
  });
}

