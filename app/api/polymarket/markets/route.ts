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
    trades?: number | string;
    outcomes?: PolymarketOutcome[] | string;
    outcomePrices?: number[] | string;
};

type PolymarketEvent = {
    id?: string;
    slug?: string;
    title?: string;
    description?: string;
    category?: string;
    endDate?: string;
    startDate?: string;
    createdAt?: string;
    image?: string | null;
    icon?: string | null;
    volume?: number | string;
    markets?: PolymarketMarket[] | string;
};

const MAX_MARKETS = 100;

const toNum = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

function normalizeOutcomes(raw: PolymarketMarket['outcomes']): PolymarketOutcome[] {
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

// Normalize Polymarket market into the shape consumed by EventCard2 (DbEvent)
function toDbEvent(market: PolymarketMarket, parent?: PolymarketEvent) {
    const outs = normalizeOutcomes(market.outcomes);
    const prices = normalizeOutcomePrices(market.outcomePrices);
    const yesOutcome = outs.find((o) => /yes/i.test(o.name));
    const noOutcome = outs.find((o) => /no/i.test(o.name));

    const yesPrice = normalizeProbValue(
        yesOutcome?.price ?? (prices[0] != null ? prices[0] : undefined),
        0.5
    );
    const noPrice = normalizeProbValue(
        noOutcome?.price ?? (prices[1] != null ? prices[1] : 1 - yesPrice),
        1 - yesPrice
    );

    const yesProb = Math.round(yesPrice * 100);
    const noProb = Math.round(noPrice * 100);

    return {
        id: market.id || market.slug || crypto.randomUUID(),
        title: market.question ?? parent?.title ?? 'Untitled market',
        description: market.description ?? parent?.description ?? '',
        category: market.category ?? market.categories?.[0] ?? parent?.category ?? 'General',
        resolutionDate: market.endDate ?? market.closeTime ?? parent?.endDate ?? parent?.startDate ?? new Date().toISOString(),
        createdAt: market.createdAt ?? parent?.createdAt ?? new Date().toISOString(),
        imageUrl: market.image ?? parent?.image ?? parent?.icon ?? null,
        volume: toNum(market.volume, 0),
        betCount: toNum(market.trades, 0),
        yesOdds: yesProb,
        noOdds: noProb,
        type: outs.length > 2 ? 'MULTIPLE' : 'BINARY',
        outcomes: outs.map((o, idx) => ({
            id: o.id || `${market.id || market.slug || 'pm'}-${idx}`,
            name: o.name,
            probability: normalizeProbValue(
                o.price ?? (prices[idx] != null ? prices[idx] : undefined),
                0.5
            ), // keep 0–1 for multi
            color: undefined
        }))
    };
}

export async function GET() {
    try {
        const params = new URLSearchParams({
            limit: '400', // fetch enough to sort top 100 by volume
            active: 'true',
            closed: 'false',
            archived: 'false'
        });

        const upstream = await fetch(`https://gamma-api.polymarket.com/events?${params.toString()}`, {
            cache: 'no-store',
            headers: {
                'User-Agent': 'polybet/1.0',
                'Accept': 'application/json'
            }
        });

        if (!upstream.ok) {
            console.error('Polymarket upstream not ok', upstream.status);
            return NextResponse.json([], { status: 200 });
        }

        const text = await upstream.text();
        try {
            const data: PolymarketEvent[] = JSON.parse(text);
            const events = Array.isArray(data) ? data : [];

            const flattened = events.flatMap((evt) => {
                const markets = normalizeMarkets(evt.markets);
                return markets.map((mkt) => toDbEvent(mkt, evt));
            });

            const topByVolume = flattened
                .sort((a, b) => (b.volume || 0) - (a.volume || 0))
                .slice(0, MAX_MARKETS);

            return NextResponse.json(topByVolume);
        } catch (err) {
            console.error('Polymarket parse failed, raw head:', text.slice(0, 400));
            return NextResponse.json([], { status: 200 });
        }
    } catch (error) {
        console.error('Polymarket fetch failed', error);
        return NextResponse.json([], { status: 200 }); // soft-fail
    }
}
