import { NextResponse } from 'next/server';
import { getPolymarketWSClient } from '@/lib/polymarket-ws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/polymarket/ws/start
 * Start Polymarket WebSocket client for real-time updates
 */
export async function POST(request: Request) {
  try {
    const wsClient = getPolymarketWSClient();
    
    // Subscribe to all active sports events
    await wsClient.subscribeToAllSportsEvents();
    
    return NextResponse.json({
      success: true,
      message: 'Polymarket WebSocket client started and subscribed to sports events',
    });
  } catch (error) {
    console.error('[WS Start] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to start WebSocket client',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/polymarket/ws/start
 * Check WebSocket status
 */
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    message: 'Use POST to start the WebSocket client',
  });
}

