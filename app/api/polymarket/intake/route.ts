import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;

type GammaOutcome = {
  id?: string;
  name: string;
  price?: number;
  probability?: number;
};

type IntakeMarket = {
  polymarketId: string;
  polymarketEventId?: string;
  conditionId?: string;
  question?: string;
  title?: string;
  description?: string;
  rules?: string;
  resolutionSource?: string;
  categories: string[];
  category?: string;
  image?: string | null;
  endDate?: string;
  startDate?: string;
  createdAt?: string;
  volume?: number;
  volume24hr?: number;
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  acceptingOrders?: boolean;
  enableOrderBook?: boolean;
  tokens: Array<{ tokenId: string; outcome?: string; price?: number }>;
  outcomes: GammaOutcome[];
  variantCount?: number;
  status: string;
  internalEventId?: string;
  notes?: string | null;
};

type PolymarketMapping = {
  polymarketId: string;
  status?: string | null;
  internalEventId?: string | null;
  notes?: string | null;
};

const HEADERS = {
  'User-Agent': 'polybet/1.0',
  Accept: 'application/json',
};

function toArray<T = any>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toNumber(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOutcomes(raw: any): GammaOutcome[] {
  const items = toArray(raw);
  return items
    .map((o: any) => {
      const name = o?.name ?? o?.label ?? o?.ticker ?? o?.outcome ?? 'Outcome';
      const price = o?.price ?? o?.probability ?? o?.p;
      return {
        id: o?.id ?? o?.slug ?? o?.ticker,
        name,
        price: price != null ? toNumber(price, undefined as any) : undefined,
        probability: price != null ? clamp01(probFromValue(price, 0.5)) : undefined,
      } as GammaOutcome;
    })
    .filter((o) => !!o.name);
}

function normalizeOutcomePrices(raw: any): number[] {
  return toArray(raw).map((v: any) => toNumber(v));
}

function probFromValue(raw: unknown, fallback = 0.5) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 100) return clamp01(n / 100);
  return clamp01(n);
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseClobTokenIds(raw: any): string[] {
  const arr = toArray<string>(raw);
  return arr.map((t) => String(t)).filter(Boolean);
}

export async function GET() {
  try {
    const upstream = await fetch('https://gamma-api.polymarket.com/events?limit=150&closed=false&archived=false', {
      cache: 'no-store',
      headers: HEADERS,
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Polymarket fetch failed: ${upstream.status}` }, { status: 502 });
    }

    const events: any[] = await upstream.json();
    const markets = events.flatMap((evt) => {
      const evtId = String(evt?.id ?? evt?.slug ?? '');
      const evtCategories = toArray<string>(evt?.categories).filter(Boolean);
      const evtCategory = evt?.category || evtCategories[0];
      const evtImage = evt?.image || evt?.icon || null;

      const parsedMarkets = toArray(evt?.markets);
      return parsedMarkets
        .filter((m: any) => toArray(m?.outcomes).length >= 2)
        .map((m: any) => {
          const prices = normalizeOutcomePrices(m.outcomePrices);
          const outcomes = normalizeOutcomes(m.outcomes);
          const yesPrice = prices[0] ?? outcomes[0]?.probability;
          const clobTokenIds = parseClobTokenIds(m.clobTokenIds);
          return {
            polymarketId: String(m.id || m.slug || m.market_id || ''),
            polymarketEventId: evtId,
            conditionId: m.conditionId || m.condition_id,
            question: m.question || m.title || m.slug,
            title: evt?.title || m.question || m.title || 'Untitled market',
            description: m.description || evt?.description || '',
            rules: m.description || evt?.description || '',
            resolutionSource: m.resolutionSource || evt?.resolutionSource,
            categories: [evtCategory, ...evtCategories, ...(toArray<string>(m.categories) as string[])].filter(Boolean),
            category: evtCategory,
            image: m.image || evtImage,
            endDate: m.endDate || m.end_date_iso || evt?.endDate,
            startDate: m.startDate || evt?.startDate,
            createdAt: m.createdAt || evt?.createdAt,
            volume: toNumber(m.volumeNum ?? m.volume ?? evt?.volume, 0),
            volume24hr: toNumber(m.volume24hr ?? evt?.volume24hr, 0),
            oneDayPriceChange: toNumber(m.oneDayPriceChange, 0),
            oneHourPriceChange: toNumber(m.oneHourPriceChange, 0),
            oneWeekPriceChange: toNumber(m.oneWeekPriceChange, 0),
            oneMonthPriceChange: toNumber(m.oneMonthPriceChange, 0),
            lastTradePrice: toNumber(m.lastTradePrice, yesPrice ?? 0),
            bestBid: toNumber(m.bestBid, 0),
            bestAsk: toNumber(m.bestAsk, 0),
            acceptingOrders: m.active !== false && m.closed !== true,
            enableOrderBook: clobTokenIds.length > 0,
            tokens: clobTokenIds.map((tokenId, idx) => ({
              tokenId,
              outcome: outcomes[idx]?.name,
              price: outcomes[idx]?.probability ?? (prices[idx] != null ? probFromValue(prices[idx], 0.5) : undefined),
            })),
            outcomes: outcomes.length
              ? outcomes
              : prices.map((p, idx) => ({
                  id: outcomes[idx]?.id ?? `${m.id || m.slug || 'pm'}-${idx}`,
                  name: outcomes[idx]?.name ?? (idx === 0 ? 'Yes' : idx === 1 ? 'No' : `Outcome ${idx + 1}`),
                  price: p,
                  probability: probFromValue(p, 0.5),
                })),
            status: 'unmapped',
            internalEventId: undefined,
            notes: undefined,
          } as IntakeMarket;
        });
    });

    const ids = markets.map((m) => m.polymarketId).filter(Boolean);

    const { prisma } = await import('@/lib/prisma');
    const mappings: PolymarketMapping[] = ids.length
      ? await prisma.polymarketMarketMapping.findMany({
          where: { polymarketId: { in: ids } },
        })
      : [];

    const mapByPoly = new Map(mappings.map((m) => [m.polymarketId, m]));

    // Aggregate by Polymarket event so the admin list shows one row per event
    const grouped = new Map<string, IntakeMarket[]>();
    for (const m of markets) {
      const key = m.polymarketEventId || m.polymarketId;
      const arr = grouped.get(key) || [];
      arr.push(m);
      grouped.set(key, arr);
    }

    const results: IntakeMarket[] = [];

    for (const [, group] of grouped) {
      // If any market in the group already has a mapping, prefer that market as primary
      const mapped = group.find((m) => mapByPoly.has(m.polymarketId));

      // Otherwise choose the market with tokens/orderbook, then by volume
      const byLiquidity = [...group].sort((a, b) => {
        const aHasBook = (a.tokens?.length || 0) > 0 ? 1 : 0;
        const bHasBook = (b.tokens?.length || 0) > 0 ? 1 : 0;
        if (aHasBook !== bHasBook) return bHasBook - aHasBook;
        return (b.volume || 0) - (a.volume || 0);
      });

      const primary = mapped || byLiquidity[0];

      // Aggregate helpful fields
      const aggregatedCategories = Array.from(
        new Set(
          group
            .flatMap((g) => g.categories || [])
            .concat(primary.category ? [primary.category] : [])
            .filter(Boolean)
        )
      );
      const maxVolume = Math.max(...group.map((g) => g.volume || 0));
      const maxVolume24 = Math.max(...group.map((g) => g.volume24hr || 0));

      // Merge mapping status from whichever market is mapped
      const mapping = mapByPoly.get(primary.polymarketId) || group.map((g) => mapByPoly.get(g.polymarketId)).find(Boolean);

      results.push({
        ...primary,
        categories: aggregatedCategories,
        volume: maxVolume,
        volume24hr: maxVolume24,
        variantCount: group.length,
        status: mapping?.status || 'unmapped',
        internalEventId: mapping?.internalEventId ?? undefined,
        notes: mapping?.notes,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('[Polymarket Intake] GET failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch Polymarket intake' },
      { status: 500 }
    );
  }
}

