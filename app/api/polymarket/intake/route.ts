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
  polymarketSlug?: string; // URL slug for Polymarket links
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
  groupItemTitle?: string;
  groupItemThreshold?: string;
  status: string;
  internalEventId?: string;
  notes?: string | null;
  // Event type classification
  marketType?: 'BINARY' | 'MULTIPLE' | 'GROUPED_BINARY';
  isGroupedBinary?: boolean;
};

type PolymarketMapping = {
  polymarketId: string;
  status?: string | null;
  internalEventId?: string | null;
  notes?: string | null;
};

const HEADERS = {
  'User-Agent': 'pariflow/1.0',
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
    .map((o: any, idx: number) => {
      // Handle both object outcomes and string outcomes (Polymarket returns string array)
      // e.g., outcomes: ["Yes", "No"] or outcomes: [{name: "Yes"}, {name: "No"}]
      let name: string;
      if (typeof o === 'string') {
        // Direct string value like "Yes" or "No"
        name = o;
      } else {
        // Object with name property
        name = o?.name ?? o?.label ?? o?.ticker ?? o?.outcome ?? `Outcome ${idx + 1}`;
      }

      const price = typeof o === 'object' ? (o?.price ?? o?.probability ?? o?.p) : undefined;
      const priceNum = price != null ? toNumber(price, undefined as any) : undefined;
      // Only extract probability if price is a valid probability value (0-1 or 0-100)
      // Don't use clamp01 on undefined - leave it undefined if probFromValue can't determine it
      const prob = priceNum != null ? probFromValue(priceNum, undefined) : undefined;
      return {
        id: typeof o === 'object' ? (o?.id ?? o?.slug ?? o?.ticker) : undefined,
        name,
        price: priceNum,
        probability: prob !== undefined ? clamp01(prob) : undefined,
      } as GammaOutcome;
    })
    .filter((o) => !!o.name);
}

function normalizeOutcomePrices(raw: any): number[] {
  return toArray(raw).map((v: any) => toNumber(v));
}

function probFromValue(raw: unknown, fallback: number | undefined = 0.5): number | undefined {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 100) return clamp01(n / 100);
  // Guard: huge numbers are not probabilities (e.g. strike levels like 120000),
  // so return undefined to indicate invalid value (caller should handle fallback)
  if (n > 100) return undefined;
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

function findYesToken(tokens: Array<{ tokenId: string; outcome?: string; price?: number }>) {
  if (!Array.isArray(tokens) || tokens.length === 0) return undefined;
  const byName = tokens.find((t) => typeof t?.outcome === 'string' && /(^|\s)yes(\s|$)/i.test(t.outcome));
  return byName || tokens[0];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status') || 'all';

    // Fetch a larger pool from Gamma to ensure filters have enough data to work with
    // NOTE: Gamma API does NOT support search param on /events endpoint, so we filter client-side
    const fetchLimit = 1000;
    const url = `https://gamma-api.polymarket.com/events?limit=${fetchLimit}&closed=false&archived=false&order=volume&ascending=false`;

    const upstream = await fetch(url, {
      cache: 'no-store',
      headers: HEADERS,
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Polymarket fetch failed: ${upstream.status}` }, { status: 502 });
    }

    const events: any[] = await upstream.json();
    const markets = events.flatMap((evt) => {
      const evtId = String(evt?.id ?? evt?.slug ?? '');
      const evtSlug = String(evt?.slug ?? ''); // Slug for URL construction
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
            polymarketSlug: evtSlug, // Pass through for URL construction
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
            groupItemTitle: (m as any).groupItemTitle || undefined,
            groupItemThreshold: (m as any).groupItemThreshold || undefined,
            tokens: clobTokenIds.map((tokenId, idx) => ({
              tokenId,
              outcome: outcomes[idx]?.name,
              // Gamma sometimes omits outcomePrices on grouped markets; fall back to lastTrade/bid/ask for the YES token.
              price:
                outcomes[idx]?.probability ??
                (prices[idx] != null
                  ? probFromValue(prices[idx], 0.5)
                  : idx === 0
                    ? probFromValue(m.lastTradePrice ?? m.bestBid ?? m.bestAsk ?? 0.5, 0.5)
                    : undefined),
            })),
            outcomes: (() => {
              // Prioritize outcomePrices array (prices) over individual outcome.price fields
              // because outcome.price might be a strike level (e.g., 120000) not a probability
              if (prices.length > 0 && prices.length === outcomes.length) {
                // Use prices array from outcomePrices - these are the actual probabilities
                return prices.map((p, idx) => {
                  const prob = probFromValue(p, undefined);
                  return {
                    id: outcomes[idx]?.id ?? `${m.id || m.slug || 'pm'}-${idx}`,
                    name: outcomes[idx]?.name ?? (idx === 0 ? 'Yes' : idx === 1 ? 'No' : `Outcome ${idx + 1}`),
                    price: prob !== undefined ? prob : undefined,
                    probability: prob !== undefined ? prob : undefined,
                  };
                });
              } else if (outcomes.length > 0) {
                // Fallback: use outcomes array, but prioritize probability field
                return outcomes.map((o, idx) => {
                  // If outcome already has a valid probability, use it
                  if (o.probability != null && o.probability >= 0 && o.probability <= 1) {
                    return o;
                  }
                  // Try to get probability from prices array if available
                  if (prices[idx] != null) {
                    const prob = probFromValue(prices[idx], undefined);
                    if (prob !== undefined) {
                      return {
                        ...o,
                        price: prob,
                        probability: prob,
                      };
                    }
                  }
                  // Last resort: try to extract from outcome.price (but this might be a strike level)
                  const prob = probFromValue(o.price, undefined);
                  return {
                    ...o,
                    probability: prob !== undefined ? prob : undefined,
                  };
                });
              } else {
                // No outcomes array, create from prices
                return prices.map((p, idx) => {
                  const prob = probFromValue(p, undefined);
                  return {
                    id: `${m.id || m.slug || 'pm'}-${idx}`,
                    name: idx === 0 ? 'Yes' : idx === 1 ? 'No' : `Outcome ${idx + 1}`,
                    price: prob !== undefined ? prob : undefined,
                    probability: prob !== undefined ? prob : undefined,
                  };
                });
              }
            })().map((o, idx, arr) => {
              // Normalize probabilities to ensure they sum to 1.0 for multiple outcomes
              // This is critical for markets with 3+ outcomes where probabilities must sum to 1.0
              if (arr.length >= 2 && o.probability != null && o.probability >= 0 && o.probability <= 1) {
                const validProbs = arr.filter((a) => a.probability != null && a.probability >= 0 && a.probability <= 1);
                // Only normalize if we have valid probabilities for at least 2 outcomes
                if (validProbs.length >= 2) {
                  const sum = validProbs.reduce((acc, a) => acc + (a.probability ?? 0), 0);
                  // Normalize if sum is > 0 (avoid division by zero) and different from 1.0
                  if (sum > 0.001 && Math.abs(sum - 1.0) > 0.001) {
                    const normalized = (o.probability ?? 0) / sum;
                    return {
                      ...o,
                      probability: clamp01(normalized),
                      price: clamp01(normalized),
                    };
                  }
                }
              }
              return o;
            }),
            status: 'unmapped',
            internalEventId: undefined,
            notes: undefined,
          } as IntakeMarket;
        });
    });

    const ids = Array.from(
      new Set(
        markets
          .flatMap((m) => [m.polymarketId, m.polymarketEventId].filter(Boolean) as string[])
          .filter(Boolean)
      )
    );

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
      // If this Polymarket "event" is actually a grouped set of many binary markets
      // (team/nominee/company style), aggregate into a MULTIPLE-style intake item.
      const groupItemMarkets = group.filter((m) => typeof m.groupItemTitle === 'string' && m.groupItemTitle.trim().length > 0);

      // For GROUPED_BINARY: ALL markets must have binary Yes/No outcomes
      // If any market has non-binary outcomes, treat as regular MULTIPLE
      const allMarketsAreBinary = groupItemMarkets.every((m) => {
        const outcomes = m.outcomes || [];
        if (outcomes.length !== 2) return false;
        const names = outcomes.map(o => o.name?.toLowerCase().trim());
        return names.includes('yes') && names.includes('no');
      });

      const canAggregateGroupItems =
        Boolean(group[0]?.polymarketEventId) && groupItemMarkets.length >= 2 && allMarketsAreBinary;

      if (canAggregateGroupItems) {
        const eventPolyId = group[0].polymarketEventId as string;
        const mapping =
          mapByPoly.get(eventPolyId) ||
          group.map((g) => mapByPoly.get(g.polymarketId)).find(Boolean);

        // Choose a representative market for non-outcome fields (title/image/etc.)
        const byLiquidity = [...group].sort((a, b) => {
          const aHasBook = (a.tokens?.length || 0) > 0 ? 1 : 0;
          const bHasBook = (b.tokens?.length || 0) > 0 ? 1 : 0;
          if (aHasBook !== bHasBook) return bHasBook - aHasBook;
          return (b.volume || 0) - (a.volume || 0);
        });
        const primary = byLiquidity[0];

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

        const aggregated = [...groupItemMarkets]
          .map((mkt) => {
            const yes = findYesToken(mkt.tokens || []);
            // Try multiple sources for probability, using probFromValue to reject invalid values
            // Prioritize outcomePrices if available
            const prices = normalizeOutcomePrices((mkt as any).outcomePrices);
            const rawProb =
              (prices.length > 0 ? prices[0] : undefined) ??
              yes?.price ??
              // Fallbacks for cases where Gamma doesn't include outcomePrices
              mkt.lastTradePrice ??
              mkt.bestBid ??
              mkt.bestAsk;
            const probability = probFromValue(rawProb, undefined);
            const name = String(mkt.groupItemTitle).trim();
            return {
              id: mkt.polymarketId,
              name,
              probability: probability !== undefined ? clamp01(probability) : undefined,
              price: probability !== undefined ? clamp01(probability) : undefined,
              tokenId: yes?.tokenId,
            };
          })
          // For group aggregation we only keep outcomes we can actually trade/map (need tokenId).
          .filter((o) => o.name.length > 0 && typeof o.tokenId === 'string' && o.tokenId.length > 0)
          .sort((a, b) => (b.probability || 0) - (a.probability || 0));

        // Need at least 2 outcomes after token filtering, otherwise this isn't a valid "multiple" mapping.
        if (aggregated.length < 2) {
          // fall through to the old "pick a primary market" logic
        } else {
          const tokens = aggregated.map((o) => ({ tokenId: o.tokenId as string, outcome: o.name, price: o.probability }));

          // Hybrid Classification Logic (Aggregated Binary Markets)
          // We need to distinguish between:
          // 1. 'MULTIPLE': Mutually exclusive outcomes (e.g. "Who will win?"). Sum of Yes ≈ 100%. Avg No probability is high.
          // 2. 'GROUPED_BINARY': Independent questions (e.g. "Will stock X hit $100, $200?"). Sum can be anything. Avg No depends on individual likelihoods.

          const outcomesWithProb = aggregated.filter((o) => o.probability !== undefined);
          const probSum = outcomesWithProb.reduce((sum, o) => sum + (o.probability || 0), 0);
          // For binary markets, the "No" probability is roughly (1 - Yes_Price)
          const avgNoProb = outcomesWithProb.length > 0
            ? outcomesWithProb.reduce((sum, o) => sum + (1 - (o.probability || 0)), 0) / outcomesWithProb.length
            : 0;

          // Debug stats
          console.log(`[Intake] "${primary.title?.slice(0, 30)}..." | Sum: ${probSum.toFixed(2)} | AvgNo: ${avgNoProb.toFixed(2)} | Valid: ${outcomesWithProb.length}/${aggregated.length}`);

          // Decision Rule:
          // - IF Sum is roughly 1.0 (0.9 - 1.1), it's strongly likely Mutually Exclusive (MULTIPLE).
          const isMutuallyExclusive = (probSum > 0.9 && probSum < 1.1);

          results.push({
            ...primary,
            polymarketId: eventPolyId,
            categories: aggregatedCategories,
            volume: maxVolume,
            volume24hr: maxVolume24,
            variantCount: group.length,
            enableOrderBook: tokens.length > 0,
            tokens,
            outcomes: aggregated.map((o) => ({
              id: o.id,
              name: o.name,
              probability: o.probability,
              price: o.price,
            })),
            status: mapping?.status || 'unmapped',
            internalEventId: mapping?.internalEventId ?? undefined,
            notes: mapping?.notes,
            // Dynamic classification based on probability analysis
            marketType: isMutuallyExclusive ? 'MULTIPLE' as const : 'GROUPED_BINARY' as const,
            isGroupedBinary: !isMutuallyExclusive,
          });
          continue;
        }
      }

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

      // Determine market type for non-grouped markets
      const outcomeCount = primary.outcomes?.length || 0;
      const isBinary = outcomeCount === 2 &&
        primary.outcomes?.some(o => o.name?.toLowerCase() === 'yes') &&
        primary.outcomes?.some(o => o.name?.toLowerCase() === 'no');
      const inferredType = isBinary ? 'BINARY' : (outcomeCount > 2 ? 'MULTIPLE' : 'BINARY');

      results.push({
        ...primary,
        categories: aggregatedCategories,
        volume: maxVolume,
        volume24hr: maxVolume24,
        variantCount: group.length,
        status: mapping?.status || 'unmapped',
        internalEventId: mapping?.internalEventId ?? undefined,
        notes: mapping?.notes,
        marketType: inferredType as 'BINARY' | 'MULTIPLE',
        isGroupedBinary: false,
      });
    }

    // Client-side search filtering (Gamma API doesn't support search on /events)
    let filteredResults = results;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredResults = filteredResults.filter(r =>
        (r.title?.toLowerCase().includes(searchLower)) ||
        (r.question?.toLowerCase().includes(searchLower)) ||
        (r.description?.toLowerCase().includes(searchLower))
      );
    }

    // Server-side filtering by status
    if (status !== 'all') {
      filteredResults = filteredResults.filter(r => r.status === status);
    }

    return NextResponse.json(filteredResults);
  } catch (error) {
    console.error('[Polymarket Intake] GET failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch Polymarket intake' },
      { status: 500 }
    );
  }
}

