import { NextResponse } from 'next/server';

type PolymarketOutcome = {
    id?: string;
    name: string;
    price?: number;
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
    volume?: number;
    trades?: number;
    outcomes?: PolymarketOutcome[];
};

// Normalize Polymarket market into the shape consumed by EventCard2 (DbEvent)
function toDbEvent(market: PolymarketMarket) {
    const yesOutcome = market.outcomes?.find((o) => /yes/i.test(o.name));
    const noOutcome = market.outcomes?.find((o) => /no/i.test(o.name));

    const yesProb =
        yesOutcome?.price != null
            ? Math.round(yesOutcome.price * 100)
            : 50;
    const noProb =
        noOutcome?.price != null
            ? Math.round(noOutcome.price * 100)
            : 100 - yesProb;

    return {
        id: market.id || market.slug || crypto.randomUUID(),
        title: market.question ?? 'Untitled market',
        description: market.description ?? '',
        category: market.category ?? market.categories?.[0] ?? 'General',
        resolutionDate: market.endDate ?? market.closeTime ?? new Date().toISOString(),
        createdAt: market.createdAt ?? new Date().toISOString(),
        imageUrl: market.image ?? null,
        volume: market.volume ?? 0,
        betCount: market.trades ?? 0,
        yesOdds: yesProb,
        noOdds: noProb,
        type: (market.outcomes?.length ?? 0) > 2 ? 'MULTIPLE' : 'BINARY',
        outcomes: (market.outcomes || []).map((o, idx) => ({
            id: o.id || `${market.id || market.slug || 'pm'}-${idx}`,
            name: o.name,
            probability: o.price != null ? o.price : 0.5, // keep 0–1 for multi
            color: undefined
        }))
    };
}

export async function GET() {
    try {
        const upstream = await fetch('https://gamma-api.polymarket.com/markets?limit=50', {
            cache: 'no-store'
        });

        if (!upstream.ok) {
            return NextResponse.json([], { status: 200 }); // soft-fail to keep UI up
        }

        const data: PolymarketMarket[] = await upstream.json();
        const mapped = Array.isArray(data) ? data.map(toDbEvent) : [];

        return NextResponse.json(mapped);
    } catch (error) {
        console.error('Polymarket fetch failed', error);
        return NextResponse.json([], { status: 200 }); // soft-fail
    }
}
