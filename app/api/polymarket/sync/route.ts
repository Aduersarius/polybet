import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

type NormalizedOutcome = {
  id?: string;
  name: string;
  probability?: number;
  color?: string;
};

type NormalizedEvent = {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  categories?: string[];
  resolutionDate?: string;
  createdAt?: string;
  imageUrl?: string | null;
  volume?: number;
  betCount?: number;
  type?: string;
  outcomes?: NormalizedOutcome[];
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

async function getSystemCreatorId() {
  const { prisma } = await import('@/lib/prisma');
  const envId = process.env.POLYMARKET_CREATOR_ID;
  if (envId) {
    const user = await prisma.user.findUnique({ where: { id: envId }, select: { id: true } });
    if (user) return user.id;
  }

  const admin = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admin) return admin.id;

  const anyUser = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!anyUser) throw new Error('No users available to assign as creator for Polymarket sync');
  return anyUser.id;
}

async function fetchPolymarketEvents(origin: string, limit: number): Promise<NormalizedEvent[]> {
  const res = await fetch(`${origin}/api/polymarket/markets?limit=${limit}&automap=false`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Polymarket fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as NormalizedEvent[]) : [];
}

export async function POST(request: Request) {
  const start = Date.now();
  const url = new URL(request.url);
  const origin = process.env.APP_URL || `${url.protocol}//${url.host}`;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200);

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { prisma } = await import('@/lib/prisma');
    const creatorId = await getSystemCreatorId();
    const events = await fetchPolymarketEvents(origin, limit);

    let created = 0;
    let updated = 0;
    let outcomesTouched = 0;

    for (const evt of events) {
      const polymarketId = evt.id?.toString() || crypto.randomUUID();
      const categories = (evt.categories || (evt.category ? [evt.category] : [])).filter(Boolean);
      const resolutionDate =
        evt.resolutionDate || evt.createdAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const type =
        evt.type ||
        ((evt.outcomes || []).length > 2 ? 'MULTIPLE' : 'BINARY');

      const baseData = {
        title: evt.title || 'Untitled market',
        description: evt.description || '',
        categories,
        imageUrl: evt.imageUrl || null,
        resolutionDate: new Date(resolutionDate),
        createdAt: evt.createdAt ? new Date(evt.createdAt) : undefined,
        status: new Date(resolutionDate) < new Date() ? 'CLOSED' : 'ACTIVE',
        type,
        source: 'POLYMARKET',
        polymarketId,
        resolutionSource: 'POLYMARKET',
        externalVolume: evt.volume ?? 0,
        externalBetCount: evt.betCount ?? 0,
        creatorId,
        isHidden: false,
      };

      const existing = await prisma.event.findFirst({
        where: { polymarketId },
        select: { id: true },
      });

      const dbEvent = existing
        ? await prisma.event.update({
            where: { id: existing.id },
            data: baseData,
          })
        : await prisma.event.create({
            data: {
              id: polymarketId,
              ...baseData,
            },
          });

      if (existing) {
        updated++;
      } else {
        created++;
      }

      const outcomes = Array.isArray(evt.outcomes) ? evt.outcomes.slice(0, 8) : [];
      for (const outcome of outcomes) {
        const polymarketOutcomeId = outcome.id?.toString();
        const probability = clamp01(Number(outcome.probability ?? 0.5));
        const name = outcome.name || 'Outcome';

        const existingOutcome = polymarketOutcomeId
          ? await prisma.outcome.findFirst({
              where: { polymarketOutcomeId },
              select: { id: true },
            })
          : await prisma.outcome.findFirst({
              where: { eventId: dbEvent.id, name },
              select: { id: true },
            });

        if (existingOutcome) {
          await prisma.outcome.update({
            where: { id: existingOutcome.id },
            data: {
              eventId: dbEvent.id,
              name,
              probability,
              polymarketOutcomeId,
              polymarketMarketId: polymarketId,
              source: 'POLYMARKET',
            },
          });
        } else {
          await prisma.outcome.create({
            data: {
              eventId: dbEvent.id,
              name,
              probability,
              polymarketOutcomeId,
              polymarketMarketId: polymarketId,
              source: 'POLYMARKET',
            },
          });
        }
        outcomesTouched++;
      }
    }

    const elapsed = Date.now() - start;
    return NextResponse.json({
      created,
      updated,
      outcomesTouched,
      elapsedMs: elapsed,
      count: events.length,
    });
  } catch (error) {
    console.error('[Polymarket Sync] failed', error);
    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // Convenience: allow GET to run the sync for manual triggering
  return POST(request);
}

