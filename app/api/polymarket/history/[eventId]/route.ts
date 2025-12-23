import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;

const DEFAULT_LOOKBACK_DAYS = 400; // Show full year of history by default

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const start = Date.now();
  try {
    const { prisma } = await import('@/lib/prisma');
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    }

    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const now = Date.now();
    const toMs = toParam ? Number(toParam) : now;
    const fromMs = fromParam ? Number(fromParam) : now - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const fromDate = new Date(fromMs);
    const toDate = new Date(toMs);

    const outcomes = await prisma.outcome.findMany({
      where: { eventId },
      select: { id: true, name: true, polymarketOutcomeId: true },
    });
    const outcomeMap = new Map<string, { name: string; tokenId?: string }>();
    for (const o of outcomes) {
      outcomeMap.set(o.id, { name: o.name, tokenId: o.polymarketOutcomeId || undefined });
    }

    const history = await prisma.oddsHistory.findMany({
      where: {
        eventId,
        timestamp: { gte: fromDate, lte: toDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    const byOutcome: Record<
      string,
      { outcomeId: string; name?: string; polymarketTokenId?: string; points: Array<{ t: number; p: number; price: number }> }
    > = {};

    for (const row of history) {
      const meta = outcomeMap.get(row.outcomeId);
      if (!byOutcome[row.outcomeId]) {
        byOutcome[row.outcomeId] = {
          outcomeId: row.outcomeId,
          name: meta?.name,
          polymarketTokenId: row.polymarketTokenId ?? meta?.tokenId,
          points: [],
        };
      }
      byOutcome[row.outcomeId].points.push({
        t: row.timestamp.getTime(),
        p: row.probability,
        price: row.price,
      });
    }

    return NextResponse.json({
      eventId,
      outcomes: Object.values(byOutcome),
      count: history.length,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    console.error('[Polymarket] history fetch failed', error);
    return NextResponse.json({ error: 'failed to load history' }, { status: 500 });
  }
}

