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
      
      // For binary events, extract YES/NO probabilities to set qYes/qNo
      let yesProb = 0.5;
      let noProb = 0.5;
      if (type === 'BINARY' && outcomes.length >= 2) {
        const yesOutcome = outcomes.find((o: any) => /yes/i.test(o.name || ''));
        const noOutcome = outcomes.find((o: any) => /no/i.test(o.name || ''));
        yesProb = clamp01(Number(yesOutcome?.probability ?? outcomes[0]?.probability ?? 0.5));
        noProb = clamp01(Number(noOutcome?.probability ?? outcomes[1]?.probability ?? 1 - yesProb));
        // Ensure they sum to 1
        const sum = yesProb + noProb;
        if (sum > 0) {
          yesProb = yesProb / sum;
          noProb = noProb / sum;
        }
      }
      
      // Update qYes/qNo for binary events if we have valid probabilities
      if (type === 'BINARY' && (yesProb !== 0.5 || noProb !== 0.5)) {
        const b = dbEvent.liquidityParameter || 20000.0;
        // Convert probabilities to qYes/qNo using inverse LMSR
        // For small probabilities, approximate: q ≈ b * ln(p / (1-p))
        const qYes = yesProb > 0.01 && yesProb < 0.99 ? b * Math.log(yesProb / (1 - yesProb)) : 0;
        const qNo = noProb > 0.01 && noProb < 0.99 ? b * Math.log(noProb / (1 - noProb)) : 0;
        
        await prisma.event.update({
          where: { id: dbEvent.id },
          data: { qYes, qNo },
        });
      }
      
      for (const outcome of outcomes) {
        const polymarketOutcomeId = outcome.id?.toString();
        // Only use probability if it's valid (0-1 range), otherwise leave undefined
        const rawProb = outcome.probability;
        const probability = rawProb != null && typeof rawProb === 'number' && rawProb >= 0 && rawProb <= 1 
          ? clamp01(rawProb) 
          : undefined;
        
        // For binary events, try to infer YES/NO from name or position
        let name = outcome.name || '';
        if (type === 'BINARY' && !name) {
          // Try to infer from position or existing outcomes
          const idx = outcomes.indexOf(outcome);
          if (idx === 0) name = 'YES';
          else if (idx === 1) name = 'NO';
          else name = `Outcome ${idx + 1}`;
        } else if (!name) {
          name = `Outcome ${outcomes.indexOf(outcome) + 1}`;
        }

        const existingOutcome = polymarketOutcomeId
          ? await prisma.outcome.findFirst({
              where: { polymarketOutcomeId },
              select: { id: true },
            })
          : await prisma.outcome.findFirst({
              where: { eventId: dbEvent.id, name },
              select: { id: true },
            });

        // Only update probability if we have a valid value (0-1 range)
        // Ensure we never store percentages (> 1) or invalid values
        let finalProbability = probability;
        if (finalProbability !== undefined) {
          // Double-check: if it's > 1, it might be a percentage, convert it
          if (finalProbability > 1 && finalProbability <= 100) {
            finalProbability = finalProbability / 100;
          }
          // Clamp to valid range
          finalProbability = clamp01(finalProbability);
        }
        
        const updateData: any = {
          eventId: dbEvent.id,
          name,
          polymarketOutcomeId,
          polymarketMarketId: polymarketId,
          source: 'POLYMARKET',
        };
        if (finalProbability !== undefined) {
          updateData.probability = finalProbability;
        }

        if (existingOutcome) {
          await prisma.outcome.update({
            where: { id: existingOutcome.id },
            data: updateData,
          });
        } else {
          await prisma.outcome.create({
            data: {
              ...updateData,
              // For binary events, we'll recalc from qYes/qNo below
              // For multiple, use the probability if we have it, otherwise 0.5 as placeholder
              probability: finalProbability ?? (type === 'BINARY' ? 0.5 : 0.5),
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

