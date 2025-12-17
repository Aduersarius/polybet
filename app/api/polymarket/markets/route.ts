export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

type PolymarketOutcome = {
    id?: string;
    name: string;
    price?: number | string;
};

type PolymarketMarket = {
    id?: string;
    slug?: string;
    question?: string;
    description?: string;
    category?: string;
    categories?: string[];
    endDate?: string;
    closeTime?: string;
    createdAt?: string;
    image?: string | null;
    volume?: number | string;
    volumeNum?: number | string;
    volume24hr?: number | string;
    volume1mo?: number | string;
    volume1wk?: number | string;
    trades?: number | string;
    outcomes?: PolymarketOutcome[] | string;
    outcomePrices?: number[] | string;
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    groupItemTitle?: string;
    groupItemThreshold?: string;
};

type PolymarketEvent = {
    id?: string;
    slug?: string;
    title?: string;
    description?: string;
    category?: string;
    categories?: string[];
    endDate?: string;
    startDate?: string;
    createdAt?: string;
    image?: string | null;
    icon?: string | null;
    volume?: number | string;
    volumeNum?: number | string;
    volume24hr?: number | string;
    volume1mo?: number | string;
    volume1wk?: number | string;
    markets?: PolymarketMarket[] | string;
};

const DEFAULT_LIMIT = 100;
const LIMIT_CAP = 100;
const MAX_FETCH = 200; // Reduced for faster loading (was 1200)

const toNum = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

function normalizeOutcomes(raw: PolymarketMarket['outcomes']): PolymarketOutcome[] {
    const coerce = (item: any): PolymarketOutcome => {
        if (typeof item === 'string') return { name: item };
        if (typeof item === 'object' && item !== null) {
            return {
                id: item.id ?? item.slug ?? item.ticker,
                name: item.name ?? item.label ?? item.ticker ?? item.outcome ?? item.slug ?? 'Outcome',
                price: item.price ?? item.probability ?? item.p
            };
        }
        return { name: 'Outcome' };
    };

    if (Array.isArray(raw)) return raw.map(coerce);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(coerce) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function normalizeOutcomePrices(raw: PolymarketMarket['outcomePrices']): number[] {
    if (Array.isArray(raw)) return raw.map((v) => Number(v));
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map((v) => Number(v)) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function normalizeProbValue(raw: unknown, fallback = 0.5) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    // Handle inputs expressed as percentages (0–100)
    if (n > 1 && n <= 100) return n / 100;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function normalizeMarkets(raw: PolymarketEvent['markets']): PolymarketMarket[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function probFromValue(raw: unknown, fallback = 0.5) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1 && n <= 100) return clamp01(n / 100);
    return clamp01(n);
}

function bestVolume(market: PolymarketMarket, parent?: PolymarketEvent) {
    const candidates = [
        market.volumeNum,
        market.volume24hr,
        market.volume1mo,
        market.volume1wk,
        market.volume,
        parent?.volumeNum,
        parent?.volume24hr,
        parent?.volume1mo,
        parent?.volume1wk,
        parent?.volume
    ];
    for (const v of candidates) {
        const n = toNum(v, -1);
        if (n >= 0) return n;
    }
    return 0;
}

function extractYesProbability(market: PolymarketMarket, prices: number[], fallback = 0.5) {
    const outs = normalizeOutcomes(market.outcomes);
    // Prefer first price from outcomePrices (most reliable from Polymarket)
    const candidates = [
        prices[0],
        outs.find((o) => /yes/i.test(o.name))?.price,
        outs[0]?.price
    ];
    for (const c of candidates) {
        if (c == null) continue;
        const prob = probFromValue(c, Number.NaN);
        if (Number.isFinite(prob)) return prob;
    }
    return probFromValue(fallback, 0.5);
}

function deriveShortName(market: PolymarketMarket, parent?: PolymarketEvent) {
    const fromSlug = market.slug?.replace(/[-_]+/g, ' ').trim();
    let base = (market.question ?? '').trim();
    if (!base && fromSlug) base = fromSlug;
    if (!base && parent?.title) base = parent.title.trim();

    if (base) {
        base = base.replace(/^will\s+/i, '').replace(/\?+$/, '').trim();
        const verbCut = base.search(/\b(be|become|remain|win|reach|hit|make|take|stay|overtake|surpass|lead|finish|secure|have|get|break|cross|achieve|pass)\b/i);
        if (verbCut > 0) {
            base = base.slice(0, verbCut).trim();
        }
        base = base.replace(/\s+/g, ' ').trim();
    }

    if (!base && parent?.slug) base = parent.slug.replace(/[-_]+/g, ' ').trim();
    if (!base && fromSlug) base = fromSlug;
    if (!base) base = 'Outcome';

    if (base.length > 25) {
        base = base.slice(0, 25).trimEnd();
    }
    return base;
}

function shortLabelFromQuestion(q?: string) {
    if (!q) return undefined;
    let base = q.trim();
    base = base.replace(/^will\s+/i, '').replace(/\?+$/, '').trim();
    const cut = base.search(/\b(be|become|remain|win|reach|hit|make|take|stay|overtake|surpass|lead|finish|secure|have|get|break|cross|achieve|pass|end)\b/i);
    if (cut > 0) base = base.slice(0, cut).trim();
    base = base.replace(/\s+/g, ' ').trim();
    if (!base) return undefined;
    if (base.length > 25) base = base.slice(0, 25).trimEnd();
    return base;
}

function nameFromSlug(slug?: string) {
    if (!slug) return undefined;
    const parts = slug.split('-').filter(Boolean);
    if (!parts.length) return undefined;
    // Drop trailing numeric token if present
    if (parts.length && /^\d+$/.test(parts[parts.length - 1])) {
        parts.pop();
    }
    if (!parts.length) return undefined;
    const candidate = parts[parts.length - 1];
    if (!candidate) return undefined;
    const name = candidate.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    if (!name) return undefined;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseShortOutcomes(market: PolymarketMarket): string[] {
    const raw = (market as any).shortOutcomes;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((s) => String(s));
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
        } catch {
            return [];
        }
    }
    return [];
}

// Smart category detection based on event content
function inferCategory(title: string, description?: string): string {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    // Crypto patterns
    if (/(bitcoin|btc|ethereum|eth|crypto|solana|sol|dogecoin|doge|blockchain|defi|nft|token|coin|crypto)/i.test(text)) {
        return 'Crypto';
    }
    
    // Politics patterns
    if (/(trump|biden|president|election|congress|senate|republican|democrat|political|politics|vote|governor|mayor|supreme court|kamala|desantis|nikki haley)/i.test(text)) {
        return 'Politics';
    }
    
    // Sports patterns
    if (/(nfl|nba|mlb|nhl|fifa|world cup|super bowl|playoffs|championship|football|basketball|baseball|soccer|tennis|golf|boxing|ufc|mma|premier league|la liga|athlete|sport)/i.test(text)) {
        return 'Sports';
    }
    
    // Business/Finance patterns
    if (/(stock|market|nasdaq|s&p|dow jones|fed|federal reserve|inflation|gdp|economy|economic|interest rate|recession|bull market|bear market|ipo|merger|acquisition|revenue|earnings|ceo|company)/i.test(text)) {
        return 'Business';
    }
    
    // Tech patterns
    if (/(apple|google|meta|microsoft|amazon|tesla|nvidia|openai|chatgpt|ai|artificial intelligence|tech|technology|software|hardware|startup|silicon valley|elon musk)/i.test(text)) {
        return 'Tech';
    }
    
    // Science patterns
    if (/(covid|vaccine|virus|pandemic|climate|global warming|nasa|space|spacex|science|research|study|scientist|discovery|medicine|medical|health)/i.test(text)) {
        return 'Science';
    }
    
    // Entertainment patterns
    if (/(movie|film|oscar|grammy|emmy|netflix|spotify|music|album|artist|actor|actress|celebrity|hollywood|entertainment|tv show|series|streaming)/i.test(text)) {
        return 'Entertainment';
    }
    
    // Pop Culture patterns
    if (/(kardashian|swift|taylor|beyonce|kanye|drake|meme|viral|tiktok|instagram|youtube|influencer|celebrity gossip)/i.test(text)) {
        return 'Pop Culture';
    }
    
    // World events patterns
    if (/(war|ukraine|russia|china|israel|palestine|iran|nato|un|united nations|international|global|conflict|peace|treaty|diplomacy)/i.test(text)) {
        return 'World';
    }
    
    return 'General';
}

// Normalize Polymarket market into the shape consumed by EventCard2 (DbEvent)
function toDbEvent(market: PolymarketMarket, parent?: PolymarketEvent) {
    const outs = normalizeOutcomes(market.outcomes);
    const prices = normalizeOutcomePrices(market.outcomePrices);
    const yesOutcome = outs.find((o) => /yes/i.test(o.name));
    const noOutcome = outs.find((o) => /no/i.test(o.name));

    const yesPriceRaw = yesOutcome?.price ?? (prices[0] != null ? prices[0] : undefined);
    const yesPrice = probFromValue(yesPriceRaw, 0.5);
    const noPrice = probFromValue(
        noOutcome?.price ?? (prices[1] != null ? prices[1] : 1 - yesPrice),
        1 - yesPrice
    );

    const type = outs.length > 2 ? 'MULTIPLE' : 'BINARY';

    const title = market.question ?? parent?.title ?? 'Untitled market';
    const description = market.description ?? parent?.description ?? '';
    
    // Use Polymarket's category if available and not "General", otherwise infer from content
    const polymarketCategory = market.category ?? market.categories?.[0] ?? parent?.category;
    const shouldInferCategory = !polymarketCategory || polymarketCategory.toLowerCase() === 'general';
    const inferredCategory = shouldInferCategory ? inferCategory(title, description) : polymarketCategory;
    
    const base = {
        id: market.id || market.slug || crypto.randomUUID(),
        title,
        description,
        category: inferredCategory,
        categories: (() => {
            const fromParent = parent?.categories?.filter(Boolean) ?? [];
            const fromMarket = market.categories?.filter(Boolean) ?? [];
            // Use inferred category if available
            const categoryList = [inferredCategory, ...fromParent, ...fromMarket].filter(Boolean);
            return categoryList.length ? Array.from(new Set(categoryList)) : [];
        })(),
        resolutionDate: market.endDate ?? market.closeTime ?? parent?.endDate ?? parent?.startDate ?? new Date().toISOString(),
        createdAt: market.createdAt ?? parent?.createdAt ?? new Date().toISOString(),
        imageUrl: market.image ?? parent?.image ?? parent?.icon ?? null,
        volume: bestVolume(market, parent),
        betCount: toNum(market.trades, 0),
        yesOdds: type === 'MULTIPLE' ? undefined : clamp01(yesPrice),
        noOdds: type === 'MULTIPLE' ? undefined : clamp01(noPrice),
        yesPrice: type === 'MULTIPLE' ? undefined : clamp01(yesPrice),
        noPrice: type === 'MULTIPLE' ? undefined : clamp01(noPrice),
        type
    };

    if (type === 'MULTIPLE') {
        const shortNames = parseShortOutcomes(market);
        const mapped = (shortNames.length ? shortNames : outs.map((o) => o.name))
            .map((name, idx) => {
                const rawPrice =
                    prices[idx] != null
                        ? prices[idx]
                        : outs[idx]?.price;
                const probability = clamp01(normalizeProbValue(rawPrice, 0.5));
                return {
                    id: outs[idx]?.id || `${market.id || market.slug || 'pm'}-${idx}`,
                    name,
                    probability,
                    price: probability,
                    odds: 1.0,
                    color: undefined
                };
            })
            .sort((a, b) => (b.probability || 0) - (a.probability || 0))
            .slice(0, 5);

        return { ...base, outcomes: mapped };
    }

    return {
        ...base,
        outcomes: outs.slice(0, 5).map((o, idx) => {
            const probability = clamp01(
                normalizeProbValue(
                    o.price ?? (prices[idx] != null ? prices[idx] : undefined),
                    0.5
                )
            );
            return {
                id: o.id || `${market.id || market.slug || 'pm'}-${idx}`,
                name: o.name,
                probability,
                price: probability,
                odds: 1.0,
                color: undefined
            };
        })
    };
}

async function fetchEvents(params: Record<string, string>) {
    const search = new URLSearchParams(params);
    const upstream = await fetch(`https://gamma-api.polymarket.com/events?${search.toString()}`, {
        cache: 'no-store',
        headers: {
            'User-Agent': 'polybet/1.0',
            'Accept': 'application/json'
        }
    });
    if (!upstream.ok) {
        console.error('Polymarket upstream not ok', upstream.status);
        return [];
    }
    const text = await upstream.text();
    try {
        const data: PolymarketEvent[] = JSON.parse(text);
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('Polymarket parse failed, raw head:', text.slice(0, 400));
        return [];
    }
}

function flattenAndMap(events: PolymarketEvent[], seen: Set<string>) {
    const results: ReturnType<typeof toDbEvent>[] = [];

    for (const evt of events) {
        const allMarkets = normalizeMarkets(evt.markets).filter((mkt) => {
            const outs = normalizeOutcomes(mkt.outcomes);
            return outs.length >= 2;
        });
        if (!allMarkets.length) continue;

        // Filter out inactive/zero-volume/closed/resolved markets
        const activeMarkets = allMarkets.filter((mkt) => {
            const vol = bestVolume(mkt, evt);
            const prices = normalizeOutcomePrices(mkt.outcomePrices);
            // Exclude if: inactive, closed, zero volume, or has 100% probability (likely resolved)
            return mkt.active !== false && 
                   mkt.closed !== true && 
                   vol > 0 && 
                   prices[0] < 0.99; // Exclude markets with ≥99% (likely resolved)
        });

        const markets = activeMarkets.length > 0 ? activeMarkets : allMarkets;

        // Check if this is a multi-market grouped event (e.g., Super Bowl teams, companies)
        // These have groupItemTitle and are binary Yes/No markets
        const groupedMarkets = markets.filter((m) => (m as any).groupItemTitle);
        
        if (groupedMarkets.length > 1) {
            // Multi-market event: aggregate using groupItemTitle as outcome names
            const outcomes = groupedMarkets.map((mkt) => {
                const prices = normalizeOutcomePrices(mkt.outcomePrices);
                // For binary markets in a group, the Yes price is the probability
                const probability = probFromValue(prices[0], 0.5);
                const name = (mkt as any).groupItemTitle || deriveShortName(mkt, evt);
                
                return {
                    id: mkt.id || mkt.slug || crypto.randomUUID(),
                    name,
                    probability,
                    price: probability, // Same as probability for display
                    odds: 1.0, // Placeholder odds (these aren't mutually exclusive so odds don't apply the same way)
                    color: undefined
                };
            });

            if (outcomes.length < 2) continue;

            const volume = Math.max(
                ...groupedMarkets.map((mkt) => bestVolume(mkt, evt)),
                bestVolume({} as any, evt)
            );
            const betCount = groupedMarkets.reduce((sum, mkt) => sum + toNum(mkt.trades, 0), 0);

            const eventTitle = evt.title ?? 'Untitled event';
            const eventDescription = evt.description ?? '';
            const polyCategory = evt.category ?? evt.categories?.[0];
            const shouldInfer = !polyCategory || polyCategory.toLowerCase() === 'general';
            const eventCategory = shouldInfer ? inferCategory(eventTitle, eventDescription) : polyCategory;
            
            const aggregated = {
                id: evt.id || evt.slug || crypto.randomUUID(),
                title: eventTitle,
                description: eventDescription,
                category: eventCategory,
                categories: (() => {
                    const fromEvent = evt.categories?.filter(Boolean) ?? [];
                    return [eventCategory, ...fromEvent].filter(Boolean);
                })(),
                resolutionDate: evt.endDate ?? evt.startDate ?? new Date().toISOString(),
                createdAt: evt.createdAt ?? new Date().toISOString(),
                imageUrl: evt.image ?? evt.icon ?? null,
                volume,
                betCount,
                yesOdds: undefined,
                noOdds: undefined,
                yesPrice: undefined,
                noPrice: undefined,
                type: 'MULTIPLE' as const,
                outcomes: outcomes
                    .sort((a, b) => (b.probability || 0) - (a.probability || 0))
                    .slice(0, 5)
            };

            const key = aggregated.id || `${aggregated.title}-${aggregated.category}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push(aggregated);
            }
            continue;
        }

        // Single market or multi-outcome market: map directly
        if (markets.length === 1) {
            const mapped = toDbEvent(markets[0], evt);
            const key = mapped.id || `${mapped.title}-${mapped.category}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push(mapped);
            }
            continue;
        }

        // Check for multi-outcome markets
        const multiOutcomeMarkets = markets.filter((m) => normalizeOutcomes(m.outcomes).length > 2);
        if (multiOutcomeMarkets.length) {
            const top = multiOutcomeMarkets.sort((a, b) => bestVolume(b, evt) - bestVolume(a, evt))[0];
            const mapped = toDbEvent(top, evt);
            const key = mapped.id || `${mapped.title}-${mapped.category}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push(mapped);
            }
            continue;
        }

        // Fall back to highest-volume binary market
        const top = markets.sort((a, b) => bestVolume(b, evt) - bestVolume(a, evt))[0];
        const mapped = toDbEvent(top, evt);
        const key = mapped.id || `${mapped.title}-${mapped.category}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push(mapped);
        }
    }

    return results;
}

export async function GET(request: Request) {
    try {
        const seen = new Set<string>();
        const { searchParams } = new URL(request.url);
        const requestedLimit = Number(searchParams.get('limit'));
        const idParam = searchParams.get('id') || undefined;
        const autoCreateMappings = searchParams.get('automap') === 'true'; // Disabled by default
        const nowIso = new Date().toISOString();
        const targetCount = Math.min(
            Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT),
            LIMIT_CAP
        );
        // When fetching by ID, use a much smaller limit for speed
        // Otherwise pull a reasonable amount (2x for aggregation buffer)
        const fetchLimit = idParam 
            ? Math.min(targetCount * 2, 20) // For specific ID, fetch less
            : Math.min(Math.max(targetCount * 2, targetCount), MAX_FETCH); // Reduced from 6x to 2x

        const baseFilters: Record<string, string> = {
            limit: `${fetchLimit}`,
            order: 'volume',
            ascending: 'false',
            active: 'true',
            closed: 'false',
            archived: 'false',
            end_date_min: nowIso
        };
        if (idParam) baseFilters.id = idParam;

        // Reduced from 3 passes to 1 pass for faster loading
        const passes: Record<string, string>[] = [baseFilters];

        let mapped: ReturnType<typeof toDbEvent>[] = [];

        for (const pass of passes) {
            const evts = await fetchEvents(pass);
            if (!evts.length) continue;
            mapped.push(...flattenAndMap(evts, seen));
            if (mapped.length >= targetCount) break;
        }

        const topByVolume = mapped
            .sort((a, b) => (b.volume || 0) - (a.volume || 0))
            .slice(0, targetCount);

        // Auto-create Polymarket market mappings for hedging (explicit opt-in only)
        if (autoCreateMappings) {
            // Fire and forget - don't block the response!
            (async () => {
                try {
                    const { prisma } = await import('@/lib/prisma');
                    
                    // Batch check existing mappings (much faster than one-by-one)
                    const eventIds = topByVolume.map(e => e.id);
                    const existingMappings = await prisma.polymarketMarketMapping.findMany({
                        where: { internalEventId: { in: eventIds } },
                        select: { internalEventId: true, lastSyncedAt: true, id: true }
                    });
                    
                    const existingMap = new Map(existingMappings.map((m: any) => [m.internalEventId, m]));
                    const toCreate: any[] = [];
                    const toUpdate: any[] = [];
                    const oneHourAgo = Date.now() - 3600000;
                    
                    for (const event of topByVolume) {
                        const existing: any = existingMap.get(event.id);
                        
                        if (!existing) {
                            // New mapping needed
                            toCreate.push({
                                internalEventId: event.id,
                                polymarketId: event.id,
                                polymarketConditionId: null,
                                polymarketTokenId: null,
                                isActive: true,
                                lastSyncedAt: new Date(),
                                outcomeMapping: event.outcomes ? {
                                    outcomes: event.outcomes.map((o: any) => ({
                                        internalId: o.id,
                                        polymarketId: o.id,
                                        name: o.name,
                                    }))
                                } : null,
                            });
                        } else if (!existing.lastSyncedAt || existing.lastSyncedAt.getTime() < oneHourAgo) {
                            // Stale mapping - update
                            toUpdate.push({
                                id: existing.id,
                                lastSyncedAt: new Date(),
                                isActive: true,
                            });
                        }
                    }
                    
                    // Batch insert new mappings
                    if (toCreate.length > 0) {
                        await prisma.polymarketMarketMapping.createMany({
                            data: toCreate,
                            skipDuplicates: true,
                        });
                        console.log(`[Polymarket] Created ${toCreate.length} mappings`);
                    }
                    
                    // Batch update stale mappings (if needed)
                    if (toUpdate.length > 0) {
                        await Promise.all(
                            toUpdate.map(u => 
                                prisma.polymarketMarketMapping.update({
                                    where: { id: u.id },
                                    data: { lastSyncedAt: u.lastSyncedAt, isActive: u.isActive },
                                })
                            )
                        );
                        console.log(`[Polymarket] Updated ${toUpdate.length} mappings`);
                    }
                } catch (mappingError) {
                    console.error('[Polymarket] Failed to create mappings:', mappingError);
                }
            })(); // Fire and forget - runs in background
        }

        // Add caching headers
        const response = NextResponse.json(topByVolume);
        // Cache for 2 minutes for single event fetches (faster page loads), 30 seconds for list fetches
        const cacheTime = idParam ? 120 : 30;
        response.headers.set('Cache-Control', `s-maxage=${cacheTime}, stale-while-revalidate=60`);
        // Add timestamp to help identify fresh data
        response.headers.set('X-Generated-At', new Date().toISOString());
        
        return response;
    } catch (error) {
        console.error('Polymarket fetch failed', error);
        return NextResponse.json([], { status: 200 }); // soft-fail
    }
}
