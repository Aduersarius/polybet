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

// Normalize Polymarket market into the shape consumed by EventCard2 (DbEvent)
function toDbEvent(market: PolymarketMarket) {
    const outs = normalizeOutcomes(market.outcomes);
    const prices = normalizeOutcomePrices(market.outcomePrices);
    const yesOutcome = outs.find((o) => /yes/i.test(o.name));
    const noOutcome = outs.find((o) => /no/i.test(o.name));

    const toNum = (v: any, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    };

    const yesPrice = yesOutcome?.price != null ? toNum(yesOutcome.price, 0.5) : (prices[0] != null ? toNum(prices[0], 0.5) : 0.5);
    const noPrice = noOutcome?.price != null ? toNum(noOutcome.price, 0.5) : (prices[1] != null ? toNum(prices[1], 0.5) : 1 - yesPrice);

    const yesProb = Math.round(yesPrice * 100);
    const noProb = Math.round(noPrice * 100);

    return {
        id: market.id || market.slug || crypto.randomUUID(),
        title: market.question ?? 'Untitled market',
        description: market.description ?? '',
        category: market.category ?? market.categories?.[0] ?? 'General',
        resolutionDate: market.endDate ?? market.closeTime ?? new Date().toISOString(),
        createdAt: market.createdAt ?? new Date().toISOString(),
        imageUrl: market.image ?? null,
        volume: toNum(market.volume, 0),
        betCount: toNum(market.trades, 0),
        yesOdds: yesProb,
        noOdds: noProb,
        type: outs.length > 2 ? 'MULTIPLE' : 'BINARY',
        outcomes: outs.map((o, idx) => ({
            id: o.id || `${market.id || market.slug || 'pm'}-${idx}`,
            name: o.name,
            probability: o.price != null
                ? toNum(o.price, 0.5)
                : prices[idx] != null
                    ? toNum(prices[idx], 0.5)
                    : 0.5, // keep 0–1 for multi
            color: undefined
        }))
    };
}

export async function GET() {
    try {
        const upstream = await fetch('https://gamma-api.polymarket.com/markets?limit=50&active=true&closed=false&archived=false', {
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
            const data: PolymarketMarket[] = JSON.parse(text);
            const mapped = Array.isArray(data) ? data.map(toDbEvent) : [];
            return NextResponse.json(mapped);
        } catch (err) {
            console.error('Polymarket parse failed, raw head:', text.slice(0, 400));
            return NextResponse.json([], { status: 200 });
        }
    } catch (error) {
        console.error('Polymarket fetch failed', error);
        return NextResponse.json([], { status: 200 }); // soft-fail
    }
}
