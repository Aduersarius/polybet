import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

const WS_URL = 'wss://ws-live-data.polymarket.com';
const BUCKET_MS = 30 * 60 * 1000; // 30m buckets for consistent candle intervals

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

async function getWebSocketClass() {
  // Prefer global WebSocket (Node 18+ undici); fallback to 'ws' package
  const anyGlobal = globalThis as any;
  if (anyGlobal.WebSocket) return anyGlobal.WebSocket;
  const ws = await import('ws');
  return (ws as any).WebSocket || (ws as any).default;
}

async function loadTokenMappings(prisma: any) {
  const mappings = await prisma.polymarketMarketMapping.findMany({
    where: { isActive: true },
    select: { internalEventId: true, outcomeMapping: true },
  });

  const eventIds = Array.from(new Set(mappings.map((m: any) => m.internalEventId).filter(Boolean)));
  const outcomes = eventIds.length
    ? await prisma.outcome.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, name: true, eventId: true, polymarketOutcomeId: true },
    })
    : [];
  const outcomeIndexByName = new Map<string, string>(); // eventId|name -> outcomeId
  const outcomeIndexByPolyId = new Map<string, string>(); // eventId|polymarketOutcomeId -> outcomeId
  for (const o of outcomes) {
    outcomeIndexByName.set(`${o.eventId}|${o.name}`, o.id);
    if (o.polymarketOutcomeId) {
      outcomeIndexByPolyId.set(`${o.eventId}|${o.polymarketOutcomeId}`, o.id);
    }
  }

  const tokenMap = new Map<string, { eventId: string; outcomeId: string }>();
  for (const m of mappings) {
    const evId = m.internalEventId;
    const outcomesArr = m?.outcomeMapping?.outcomes;
    if (!evId || !Array.isArray(outcomesArr)) continue;
    for (const o of outcomesArr) {
      const tokenId = o?.polymarketId || o?.polymarketTokenId;
      const name = typeof o?.name === 'string' ? o.name : '';
      const polyId = o?.polymarketId || o?.polymarketOutcomeId || o?.polymarketTokenId;
      if (!tokenId) continue;
      const outcomeId =
        (polyId ? outcomeIndexByPolyId.get(`${evId}|${polyId}`) : undefined) ||
        (name ? outcomeIndexByName.get(`${evId}|${name}`) : undefined);
      if (!outcomeId) continue;
      tokenMap.set(String(tokenId), { eventId: evId, outcomeId });
    }
  }

  return tokenMap;
}

function extractMidPrices(msg: any): Array<{ tokenId: string; price: number }> {
  const results: Array<{ tokenId: string; price: number }> = [];
  const payload = msg?.data ?? msg;
  const candidate = payload?.data ?? payload;
  const type = payload?.type || candidate?.type;
  const tokenId = candidate?.token_id || candidate?.tokenId || payload?.token_id || payload?.tokenId;

  const bids = candidate?.bids || payload?.bids;
  const asks = candidate?.asks || payload?.asks;

  if ((type === 'orderbook' || bids || asks) && tokenId) {
    const bestBid = Array.isArray(bids) && bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : undefined;
    const bestAsk = Array.isArray(asks) && asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : undefined;
    let mid: number | undefined;
    if (bestBid != null && bestAsk != null) mid = (bestBid + bestAsk) / 2;
    else if (bestAsk != null) mid = bestAsk;
    else if (bestBid != null) mid = bestBid;
    if (Number.isFinite(mid)) {
      results.push({ tokenId: String(tokenId), price: mid as number });
    }
  }

  return results;
}

export async function GET() {
  const start = Date.now();
  try {
    const WS = await getWebSocketClass();
    const { prisma } = await import('@/lib/prisma');
    const tokenMap = await loadTokenMappings(prisma);
    if (!tokenMap.size) {
      return NextResponse.json({ ingested: 0, reason: 'no mappings' });
    }

    const buckets = new Map<
      string,
      { eventId: string; outcomeId: string; tokenId: string; timestampMs: number; price: number }
    >();

    await new Promise<void>((resolve) => {
      const ws = new WS(WS_URL);
      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 45_000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['orderbook'] }));
      };

      ws.onmessage = (evt: any) => {
        try {
          const parsed = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
          const mids = extractMidPrices(parsed);
          const now = Date.now();
          const bucketTs = Math.floor(now / BUCKET_MS) * BUCKET_MS;
          for (const mid of mids) {
            const mapping = tokenMap.get(mid.tokenId);
            if (!mapping) continue;
            const key = `${mapping.eventId}|${mapping.outcomeId}|${bucketTs}`;
            buckets.set(key, {
              eventId: mapping.eventId,
              outcomeId: mapping.outcomeId,
              tokenId: mid.tokenId,
              timestampMs: bucketTs,
              price: mid.price,
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      const finish = () => {
        clearTimeout(timeout);
        resolve();
      };

      ws.onerror = finish;
      ws.onclose = finish;
    });

    const rows = Array.from(buckets.values()).map((b) => ({
      eventId: b.eventId,
      outcomeId: b.outcomeId,
      polymarketTokenId: b.tokenId,
      timestamp: new Date(b.timestampMs),
      price: b.price,
      probability: clamp01(b.price),
      source: 'POLYMARKET',
    }));

    if (rows.length) {
      await prisma.oddsHistory.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ ingested: rows.length, durationMs: Date.now() - start });
  } catch (error) {
    console.error('[Polymarket] odds history stream failed', error);
    return NextResponse.json({ error: 'stream failed' }, { status: 500 });
  }
}

