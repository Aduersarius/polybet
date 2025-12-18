import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const WS_URL = 'wss://ws-live-data.polymarket.com';

type MappingOutcome = { internalId?: string; polymarketId?: string; polymarketTokenId?: string; name?: string };

async function getWebSocketClass() {
  const anyGlobal = globalThis as any;
  if (anyGlobal.WebSocket) return anyGlobal.WebSocket;
  const ws = await import('ws');
  return (ws as any).WebSocket || (ws as any).default;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function extractMidPrices(msg: any): Array<{ tokenId: string; price: number }> {
  const payload = msg?.data ?? msg;
  const candidate = payload?.data ?? payload;
  const type = payload?.type || candidate?.type;
  const tokenId = candidate?.token_id || candidate?.tokenId || payload?.token_id || payload?.tokenId;

  const bids = candidate?.bids || payload?.bids;
  const asks = candidate?.asks || payload?.asks;

  const result: Array<{ tokenId: string; price: number }> = [];
  if ((type === 'orderbook' || bids || asks) && tokenId) {
    const bestBid = Array.isArray(bids) && bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : undefined;
    const bestAsk = Array.isArray(asks) && asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : undefined;
    let mid: number | undefined;
    if (bestBid != null && bestAsk != null) mid = (bestBid + bestAsk) / 2;
    else if (bestAsk != null) mid = bestAsk;
    else if (bestBid != null) mid = bestBid;
    if (Number.isFinite(mid)) result.push({ tokenId: String(tokenId), price: mid as number });
  }
  return result;
}

async function buildTokenMap(prisma: any, eventId: string) {
  const mapping = await prisma.polymarketMarketMapping.findFirst({
    where: { internalEventId: eventId, isActive: true },
    select: { outcomeMapping: true, internalEventId: true },
  });

  const outcomes = await prisma.outcome.findMany({
    where: { eventId },
    select: { id: true, name: true, polymarketOutcomeId: true },
  });

  const outcomeIndexByName = new Map<string, string>(); // name -> outcomeId
  const outcomeIndexByPolyId = new Map<string, string>(); // polymarketOutcomeId -> outcomeId
  for (const o of outcomes) {
    if (o.polymarketOutcomeId) outcomeIndexByPolyId.set(o.polymarketOutcomeId, o.id);
    if (o.name) outcomeIndexByName.set(o.name.toLowerCase(), o.id);
  }

  const tokenMap = new Map<string, { outcomeId: string; name: string }>();

  const mappedOutcomes: MappingOutcome[] | undefined = (mapping as any)?.outcomeMapping?.outcomes;
  if (Array.isArray(mappedOutcomes)) {
    for (const o of mappedOutcomes) {
      const tokenId = o?.polymarketTokenId || o?.polymarketId;
      if (!tokenId) continue;
      const fromPoly = o?.polymarketId ? outcomeIndexByPolyId.get(String(o.polymarketId)) : undefined;
      const fromToken = outcomeIndexByPolyId.get(String(tokenId));
      const fromName = o?.name ? outcomeIndexByName.get(o.name.toLowerCase()) : undefined;
      const outcomeId = fromToken || fromPoly || fromName;
      if (outcomeId) {
        const name = outcomes.find((x: any) => x.id === outcomeId)?.name || o?.name || String(tokenId);
        tokenMap.set(String(tokenId), { outcomeId, name });
      }
    }
  }

  // Fallback: use outcomes with polymarketOutcomeId directly
  for (const o of outcomes) {
    if (o.polymarketOutcomeId && !tokenMap.has(o.polymarketOutcomeId)) {
      tokenMap.set(o.polymarketOutcomeId, { outcomeId: o.id, name: o.name || o.polymarketOutcomeId });
    }
  }

  return tokenMap;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const start = Date.now();
  const controller = new AbortController();
  try {
    const { prisma } = await import('@/lib/prisma');
    const { id: eventId } = await params;
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    }

    const tokenMap = await buildTokenMap(prisma, eventId);
    if (!tokenMap.size) {
      return NextResponse.json({ error: 'no token mapping for event' }, { status: 404 });
    }

    const WS = await getWebSocketClass();
    const mids = new Map<string, number>();

    await new Promise<void>((resolve) => {
      const ws = new WS(WS_URL);
      const timeout = setTimeout(() => {
        controller.abort();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve();
      }, 8_000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['orderbook'] }));
      };

      ws.onmessage = (evt: any) => {
        if (controller.signal.aborted) return;
        try {
          const parsed = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
          for (const mid of extractMidPrices(parsed)) {
            mids.set(mid.tokenId, mid.price);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        resolve();
      };
    });

    const samples: Array<{ tokenId: string; name: string; outcomeId: string; probability: number }> = [];
    for (const [tokenId, price] of mids.entries()) {
      const mapped = tokenMap.get(tokenId);
      if (!mapped) continue;
      samples.push({
        tokenId,
        outcomeId: mapped.outcomeId,
        name: mapped.name,
        probability: clamp01(price),
      });
    }

    // If nothing captured, return informative 204
    if (!samples.length) {
      return NextResponse.json({ eventId, outcomes: [], durationMs: Date.now() - start }, { status: 204 });
    }

    return NextResponse.json({
      eventId,
      outcomes: samples,
      durationMs: Date.now() - start,
      count: samples.length,
    });
  } catch (err) {
    console.error('[Polymarket] live odds fetch failed', err);
    return NextResponse.json({ error: 'failed to fetch live odds' }, { status: 500 });
  }
}


