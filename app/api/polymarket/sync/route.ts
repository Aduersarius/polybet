import { NextResponse } from 'next/server';
import { scaleVolumeForStorage } from '@/lib/volume-scaler';
import { normalizeProbability } from '@/lib/polymarket-normalization';
import { logError } from '@/lib/rate-limiter';

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
  const origin = process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200);

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { prisma } = await import('@/lib/prisma');
    const creatorId = await getSystemCreatorId();

    // SSRF Mitigation: Validate origin is trusted and internal
    const trustedOrigins = [process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000', 'https://pariflow.com'].filter(Boolean);
    const isTrusted = trustedOrigins.some(to => origin.startsWith(to!));
    if (!isTrusted && process.env.NODE_ENV === 'production') {
      throw new Error(`Untrusted origin for internal sync: ${origin}`);
    }

    const events = await fetchPolymarketEvents(origin, limit);

    let created = 0;
    let updated = 0;
    let outcomesTouched = 0;

    for (const evt of events) {
      const polymarketId = evt.id?.toString() || crypto.randomUUID();

      try {
        // ============================================================================
        // ATOMIC TRANSACTION: All event + outcome operations or none
        // ============================================================================
        await prisma.$transaction(async (tx: Omit<typeof prisma, '$transaction' | '$extends' | '$on'>) => {
          const categories = (evt.categories || (evt.category ? [evt.category] : [])).filter(Boolean);
          const resolutionDate =
            evt.resolutionDate || evt.createdAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const type =
            evt.type ||
            ((evt.outcomes || []).length > 2 ? 'MULTIPLE' : 'BINARY');

          const existing = await tx.event.findFirst({
            where: { polymarketId },
            select: { id: true, slug: true },
          });

          // Generate a human-readable slug using LLM if it's missing
          let slug = existing?.slug;
          if (!slug && evt.title) {
            console.log(`[Sync] Generating slug for: ${evt.title.slice(0, 50)}...`);
            const { generateSlugWithLLM } = await import('@/lib/slug');
            slug = await generateSlugWithLLM(evt.title, new Date(resolutionDate));
            console.log(`[Sync] Result: ${slug || 'FAILED'}`);

            // Optional: Conflict resolution for slugs in sync
            if (slug) {
              const conflict = await tx.event.findFirst({
                where: { slug, NOT: { polymarketId } }
              });
              if (conflict) {
                slug = `${slug}-${polymarketId.slice(0, 4)}`;
              }
            }
          }

          const baseData: any = {
            title: evt.title || 'Untitled market',
            description: evt.description || '',
            slug: slug || null,
            categories,
            imageUrl: evt.imageUrl || null,
            resolutionDate: new Date(resolutionDate),
            createdAt: evt.createdAt ? new Date(evt.createdAt) : undefined,
            status: new Date(resolutionDate) < new Date() ? 'CLOSED' : 'ACTIVE',
            type,
            source: 'POLYMARKET',
            polymarketId,
            resolutionSource: 'POLYMARKET',
            externalVolume: scaleVolumeForStorage(evt.volume ?? 0),
            externalBetCount: evt.betCount ?? 0,
            creatorId,
            isHidden: false,
          };

          const dbEvent = existing
            ? await tx.event.update({
              where: { id: existing.id },
              data: baseData,
            })
            : await tx.event.create({
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

          // ============================================================================
          // PROBABILITY-FIRST APPROACH (No LMSR)
          // ============================================================================
          let yesProb = 0.5;
          let noProb = 0.5;

          if (type === 'BINARY' && outcomes.length >= 2) {
            const yesOutcome = outcomes.find((o: any) => /yes/i.test(o.name || ''));
            const noOutcome = outcomes.find((o: any) => /no/i.test(o.name || ''));

            yesProb = normalizeProbability(
              yesOutcome?.probability ?? outcomes[0]?.probability ?? 0.5,
              0.5
            ) ?? 0.5;

            noProb = normalizeProbability(
              noOutcome?.probability ?? outcomes[1]?.probability ?? (1 - yesProb),
              1 - yesProb
            ) ?? (1 - yesProb);

            const sum = yesProb + noProb;
            if (sum > 0) {
              yesProb = yesProb / sum;
              noProb = noProb / sum;
            }

            // Update binary probabilities directly (NO LMSR CONVERSION)
            await tx.event.update({
              where: { id: dbEvent.id },
              data: {
                yesOdds: yesProb,
                noOdds: noProb,
                qYes: 0,
                qNo: 0,
              },
            });
          }

          // ============================================================================
          // OUTCOME CREATION/UPDATE (in same transaction)
          // ============================================================================
          await Promise.all(
            outcomes.map(async (outcome) => {
              const polymarketOutcomeId = outcome.id?.toString();

              const rawProb = outcome.probability;
              const probability = normalizeProbability(rawProb, undefined);

              let name = outcome.name || '';
              if (type === 'BINARY' && !name) {
                const idx = outcomes.indexOf(outcome);
                if (idx === 0) name = 'YES';
                else if (idx === 1) name = 'NO';
                else name = `Outcome ${idx + 1}`;
              } else if (!name) {
                name = `Outcome ${outcomes.indexOf(outcome) + 1}`;
              }

              const existingOutcome = polymarketOutcomeId
                ? await tx.outcome.findFirst({
                  where: { polymarketOutcomeId },
                  select: { id: true },
                })
                : await tx.outcome.findFirst({
                  where: { eventId: dbEvent.id, name },
                  select: { id: true },
                });

              const updateData: any = {
                eventId: dbEvent.id,
                name,
                polymarketOutcomeId,
                polymarketMarketId: polymarketId,
                source: 'POLYMARKET',
              };

              if (probability !== undefined) {
                updateData.probability = probability;
              }

              if (existingOutcome) {
                await tx.outcome.update({
                  where: { id: existingOutcome.id },
                  data: updateData,
                });
              } else {
                await tx.outcome.create({
                  data: {
                    ...updateData,
                    probability: probability ?? (type === 'BINARY' ? 0.5 : 1.0 / outcomes.length),
                  },
                });
              }
              outcomesTouched++;
            })
          );
        }, {
          timeout: 30000,
          isolationLevel: 'ReadCommitted'
        });

      } catch (eventError) {
        // Log error but continue to next event (fail gracefully)
        logError('polymarket-sync-event', eventError, {
          eventId: polymarketId,
          eventTitle: evt.title,
          processedSoFar: created + updated,
          totalEvents: events.length
        });
        // Don't increment created/updated counters for failed events
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
    logError('polymarket-sync', error);
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
