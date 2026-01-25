import { NextRequest, NextResponse } from 'next/server';
import { calculateLMSROdds } from '@/lib/amm';
import { calculateDisplayVolume } from '@/lib/volume-scaler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    try {
        const { getOrSet } = await import('@/lib/cache');
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const lookupByPolymarket = searchParams.get('by') === 'polymarket';



        // Use Redis caching with longer TTL (but still low to keep freshness)
        const cacheKey = `${lookupByPolymarket ? 'poly' : 'evt'}:${id}:v3`;
        const eventWithOdds = await getOrSet(
            cacheKey,
            async () => {
                const { prisma } = await import('@/lib/prisma');

                const queryPromise = (async () => {
                    const { prisma } = await import('@/lib/prisma');

                    const commonInclude = {
                        creator: {
                            select: {
                                id: true,
                                username: true,
                                address: true,
                            },
                        },
                        outcomes: true,
                    };

                    if (lookupByPolymarket) {
                        const byPoly = await prisma.event.findUnique({
                            where: { polymarketId: id },
                            include: commonInclude,
                        });

                        if (byPoly) return byPoly;

                        // Fallback: if the caller passed our internal event id with by=polymarket, try id lookup.
                        return prisma.event.findUnique({
                            where: { id },
                            include: commonInclude,
                        });
                    }

                    // Try direct ID lookup first
                    const byId = await prisma.event.findUnique({
                        where: { id },
                        include: commonInclude,
                    });

                    if (byId) return byId;

                    // Support human-readable slugs
                    return prisma.event.findUnique({
                        where: { slug: id },
                        include: commonInclude,
                    });
                })();

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Database query timeout')), 8000);
                });

                const event = await Promise.race([queryPromise, timeoutPromise]);



                if (!event) {
                    throw new Error('Event not found');
                }

                const eventId = (event as any).id;
                const [volumeRow, betCount] = await Promise.all([
                    prisma.$queryRaw<{ volume: number }[]>`
                        SELECT COALESCE(SUM("amount" * COALESCE("price", 1)), 0)::float AS volume
                        FROM "MarketActivity"
                        WHERE "eventId" = ${eventId} AND "type" IN ('BET', 'TRADE')
                    `,
                    prisma.marketActivity.count({
                        where: { eventId: eventId, type: { in: ['BET', 'TRADE'] } },
                    }),
                ]);
                const activityVolume = volumeRow?.[0]?.volume ?? 0;

                // Use activity volume if available, otherwise fall back to external volume with time-based growth
                const externalVol = (event as any).externalVolume ?? 0;
                const grownExternalVol = calculateDisplayVolume(externalVol, (event as any).createdAt);
                const volume = activityVolume > 0 ? activityVolume : grownExternalVol;

                // If outcomes > 2, enforce MULTIPLE to avoid stale binary type, UNLESS it is explicitly GROUPED_BINARY
                const originalType = (event as any).type;
                const inferredType = originalType === 'GROUPED_BINARY'
                    ? 'GROUPED_BINARY'
                    : ((event as any).outcomes?.length > 2 ? 'MULTIPLE' : originalType);

                let response: any = {
                    ...event,
                    type: inferredType,
                    rules: (event as any).rules,
                    volume,
                    betCount,
                };

                if (inferredType === 'MULTIPLE' || inferredType === 'GROUPED_BINARY') {
                    // For multiple outcomes: use stored probability first (Polymarket-synced events),
                    // only fall back to LMSR for locally-created events with liquidity positions
                    const { calculateMultipleLMSRProbabilities } = await import('@/lib/amm');
                    const b = (event as any).liquidityParameter || 10000.0;

                    // Check if any outcome has stored probability (non-zero, non-default)
                    const hasStoredProbabilities = (event as any).outcomes.some(
                        (o: any) => o.probability != null && o.probability !== 0.5 && o.probability > 0
                    );

                    // Create liquidity map from outcomes for LMSR fallback
                    const outcomeLiquidities = new Map<string, number>();
                    (event as any).outcomes.forEach((outcome: any) => {
                        outcomeLiquidities.set(outcome.id, outcome.liquidity || 0);
                    });

                    // Check if there's meaningful liquidity for LMSR calculation
                    const hasLiquidity = Array.from(outcomeLiquidities.values()).some(l => l > 0);

                    // Calculate LMSR probabilities only if we have liquidity and no stored probabilities
                    const lmsrProbabilities = hasLiquidity && !hasStoredProbabilities
                        ? calculateMultipleLMSRProbabilities(outcomeLiquidities, b)
                        : new Map<string, number>();

                    // Add calculated odds to outcomes - prioritize stored probability
                    const outcomesWithOdds = (event as any).outcomes.map((outcome: any) => {
                        // Priority: 1) stored probability, 2) LMSR calculated, 3) equal split
                        let probability = outcome.probability;
                        if (probability == null || probability === 0) {
                            probability = lmsrProbabilities.get(outcome.id) || (1 / (event as any).outcomes.length);
                        }
                        return {
                            ...outcome,
                            probability, // Set the probability field for the component
                            price: probability, // Current market price (probability)
                            odds: probability > 0 ? 1 / probability : 1,
                        };
                    });
                    response.outcomes = outcomesWithOdds;
                } else {
                    // Binary event logic
                    const source = (event as any).source;
                    const yesOdds = (event as any).yesOdds;
                    const noOdds = (event as any).noOdds;

                    // Priority:
                    // 1. If we have direct odds (synced from Polymarket), use them
                    // 2. If we have outcome probabilities (synced via other routes), use them
                    // 3. If it is a LOCAL event with q positions, use LMSR
                    // 4. 50/50 fallback

                    let finalProbs;
                    const yesOutcome = (event as any).outcomes?.find((o: any) => /^yes$/i.test(o.name));
                    const noOutcome = (event as any).outcomes?.find((o: any) => /^no$/i.test(o.name));



                    if (yesOdds != null && noOdds != null && source === 'POLYMARKET') {
                        finalProbs = { yesPrice: yesOdds, noPrice: noOdds };
                    } else if (yesOutcome && noOutcome && yesOutcome.probability != null && noOutcome.probability != null) {
                        finalProbs = {
                            yesPrice: yesOutcome.probability,
                            noPrice: noOutcome.probability
                        };
                    } else {
                        const qYes = (event as any).qYes || 0;
                        const qNo = (event as any).qNo || 0;
                        const b = (event as any).liquidityParameter || 10000.0;

                        if (qYes === 0 && qNo === 0) {
                            finalProbs = { yesPrice: 0.5, noPrice: 0.5 };
                        } else {
                            const diff = (qNo - qYes) / b;
                            const yesPrice = 1 / (1 + Math.exp(diff));
                            const noPrice = 1 - yesPrice;
                            finalProbs = { yesPrice, noPrice };
                        }
                    }

                    response.yesOdds = finalProbs.yesPrice;
                    response.noOdds = finalProbs.noPrice;
                }

                return response;
            },
            { ttl: 600, prefix: 'event' }
        );

        const queryTime = Date.now() - startTime;
        console.log('✅ Event', (await params).id, 'fetched in', queryTime, 'ms');

        // If inferred MULTIPLE but cached payload still binary, bust cache and retry once
        if ((eventWithOdds as any)?.type === 'BINARY' && Array.isArray((eventWithOdds as any)?.outcomes) && (eventWithOdds as any).outcomes.length > 2) {
            try {
                const { invalidate } = await import('@/lib/cache');
                await invalidate(cacheKey, 'event');
            } catch {
                // ignore cache errors
            }
            const refreshed = await getOrSet(
                `${cacheKey}:bust`,
                async () => {
                    const { prisma } = await import('@/lib/prisma');
                    const whereClause: any = lookupByPolymarket ? { polymarketId: id } : { id };
                    const freshEvent = await prisma.event.findUnique({
                        where: whereClause,
                        include: {
                            creator: { select: { id: true, username: true, address: true } },
                            outcomes: true,
                        },
                    });
                    if (!freshEvent) throw new Error('Event not found');
                    const inferred = (freshEvent as any).outcomes?.length > 2 ? 'MULTIPLE' : (freshEvent as any).type;
                    return { ...freshEvent, type: inferred };
                },
                { ttl: 60, prefix: 'event' },
            );
            return NextResponse.json(refreshed);
        }

        return NextResponse.json(eventWithOdds);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error('❌ Event fetch failed after', errorTime, 'ms:', error);

        if (error instanceof Error && error.message === 'Database query timeout') {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Query took too long to execute'
            }, { status: 504 });
        }

        return NextResponse.json(
            { error: 'Failed to fetch event' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/events/[id]
 * Delete an event and its associated image from Vercel Blob storage
 * Requires admin authentication
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { requireAdminAuth } = await import('@/lib/auth');
        await requireAdminAuth(request);

        const { id } = await params;

        const { prisma } = await import('@/lib/prisma');

        // First, get the event to retrieve the image URL
        const event = await prisma.event.findUnique({
            where: { id },
            select: { id: true, imageUrl: true, polymarketId: true },
        });

        if (!event) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            );
        }

        // Delete image from Vercel Blob if it exists
        if (event.imageUrl && event.imageUrl.includes('blob.vercel-storage.com')) {
            try {
                const { deleteEventImageFromBlob } = await import('@/lib/event-image-blob');
                await deleteEventImageFromBlob(event.imageUrl);
                console.log('[Event Delete] ✓ Deleted image from Blob:', event.id);
            } catch (imgErr) {
                console.warn('[Event Delete] Failed to delete image from Blob (non-critical):', imgErr);
            }
        }

        // Delete related records first (due to foreign key constraints)
        await prisma.$transaction([
            // Delete odds history
            prisma.oddsHistory.deleteMany({ where: { eventId: id } }),
            // Delete market activity
            prisma.marketActivity.deleteMany({ where: { eventId: id } }),
            // Delete user favorites
            prisma.userFavorite.deleteMany({ where: { eventId: id } }),
            // Delete positions
            prisma.position.deleteMany({ where: { eventId: id } }),
            // Delete outcomes
            prisma.outcome.deleteMany({ where: { eventId: id } }),
            // Delete polymarket mapping if exists
            ...(event.polymarketId
                ? [prisma.polymarketMarketMapping.deleteMany({ where: { polymarketId: event.polymarketId } })]
                : []),
            // Finally delete the event
            prisma.event.delete({ where: { id } }),
        ]);

        // Invalidate cache
        try {
            const { invalidate } = await import('@/lib/cache');
            await invalidate(`evt:${id}`, 'event');
            if (event.polymarketId) {
                await invalidate(`poly:${event.polymarketId}`, 'event');
            }
        } catch {
            // best-effort cache bust
        }

        console.log('[Event Delete] ✓ Deleted event:', id);
        return NextResponse.json({ success: true, deletedId: id });
    } catch (error) {
        console.error('[Event Delete] Failed:', error);

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to delete event', message: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
