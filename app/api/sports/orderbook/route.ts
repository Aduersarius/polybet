export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const CLOB_API_URL = 'https://clob.polymarket.com';

/**
 * Calculate mid price from orderbook
 */
function calculateMid(bids: any[], asks: any[]): number | null {
  if (!bids || !asks || bids.length === 0 || asks.length === 0) {
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
}

/**
 * Fetch orderbook for a specific token from Polymarket CLOB API
 */
async function fetchTokenOrderbook(tokenId: string) {
  try {
    const url = `${CLOB_API_URL}/orderbook?token_id=${encodeURIComponent(tokenId)}`;
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`[Sports Orderbook] Failed to fetch orderbook for token ${tokenId}:`, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    return {
      bids: data.bids || [],
      asks: data.asks || [],
      mid: calculateMid(data.bids || [], data.asks || []),
    };
  } catch (error) {
    console.error(`[Sports Orderbook] Error fetching orderbook for token ${tokenId}:`, error);
    return null;
  }
}

/**
 * GET /api/sports/orderbook?eventId=...
 * Fetch orderbook data from Polymarket for a sports event
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    
    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId parameter is required' },
        { status: 400 }
      );
    }
    
    // 1. Get event from database with Polymarket mapping
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        polymarketMapping: true,
        outcomes: true,
      },
    });
    
    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }
    
    // 2. Check if event has Polymarket mapping
    if (!event.polymarketMapping) {
      return NextResponse.json(
        { 
          error: 'No Polymarket mapping found for this event',
          fallback: {
            yes: { bids: [], asks: [], mid: event.yesOdds || 0.5 },
            no: { bids: [], asks: [], mid: event.noOdds || 0.5 },
          }
        },
        { status: 200 }
      );
    }
    
    const { yesTokenId, noTokenId } = event.polymarketMapping;
    
    if (!yesTokenId || !noTokenId) {
      return NextResponse.json(
        { 
          error: 'Token IDs not found in Polymarket mapping',
          fallback: {
            yes: { bids: [], asks: [], mid: event.yesOdds || 0.5 },
            no: { bids: [], asks: [], mid: event.noOdds || 0.5 },
          }
        },
        { status: 200 }
      );
    }
    
    // 3. Fetch orderbooks from Polymarket
    const [yesBook, noBook] = await Promise.all([
      fetchTokenOrderbook(yesTokenId),
      fetchTokenOrderbook(noTokenId),
    ]);
    
    // 4. Return formatted orderbook data
    return NextResponse.json({
      eventId: event.id,
      title: event.title,
      yes: yesBook || { bids: [], asks: [], mid: event.yesOdds || 0.5 },
      no: noBook || { bids: [], asks: [], mid: event.noOdds || 0.5 },
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Sports Orderbook] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch orderbook',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

