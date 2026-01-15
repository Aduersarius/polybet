export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { isEsports, detectLeague, detectSport, parseTeams, normalizeGameStatus } from '@/lib/sports-classifier';
import { scaleVolumeForStorage } from '@/lib/volume-scaler';
import type { PolymarketSportsEvent } from '@/types/sports';

// Sentry Cron Monitor slug (must match Sentry dashboard)
const CRON_MONITOR_SLUG = 'sports-sync-cron';

const POLYMARKET_SPORTS_URL = 'https://gamma-api.polymarket.com/events';

/**
 * Classify event as live, upcoming, or long-term future
 */
function classifyEvent(startTime: Date | null, resolutionDate: Date): string {
  const now = new Date();
  const daysUntilResolution = (resolutionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // Event is live if: started but not yet resolved
  if (startTime && startTime <= now && resolutionDate > now) {
    return 'live';  // Game in progress
  }

  // Event is upcoming if: resolves within next 7 days
  if (daysUntilResolution <= 7 && daysUntilResolution > 0) {
    return 'upcoming';  // Next week
  }

  // Event is long-term future if: resolves > 30 days out
  if (daysUntilResolution > 30) {
    return 'futures';  // Long-term (championships, MVP, etc.)
  }

  return 'upcoming';
}

interface NormalizedSportsEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  categories: string[];
  resolutionDate: Date;
  createdAt: Date;
  imageUrl: string | null;
  volume: number;
  betCount: number;
  yesOdds?: number;
  noOdds?: number;
  type: string;
  source: string;
  polymarketId: string;

  // Sports-specific fields
  league?: string;
  sport?: string;
  teamA?: string;
  teamB?: string;
  score?: string;
  period?: string;
  elapsed?: string;
  live: boolean;
  gameStatus?: string;
  startTime?: Date;
  isEsports: boolean;
  eventType: string; // 'live' | 'upcoming' | 'futures'

  // WebSocket subscription tokens
  yesTokenId?: string;
  noTokenId?: string;
  clobTokenIds?: string[];
}

/**
 * Fetch sports events from Polymarket API
 */
async function fetchPolymarketSports(limit = 500): Promise<PolymarketSportsEvent[]> {
  try {
    // Fetch sports events with specific tags to get actual games
    // Using high limits for esports to capture all matches
    const tags = [
      'counter-strike',  // Primary CS2 tag - high priority
      'cs2',
      'esports',
      'dota-2',
      'league-of-legends',
      'nfl',
      'nba',
      'nhl',
      'premier-league',  // More specific than 'soccer'
      'champions-league',
      'la-liga',
      'bundesliga',
      'serie-a',
      'ufc',
      'mma',
    ];
    const allEvents: PolymarketSportsEvent[] = [];

    for (const tag of tags) {
      // Higher limits for esports to catch all matches
      const tagLimit = (tag.includes('counter-strike') || tag === 'cs2' || tag === 'esports') ? 500 : 200;

      const url = `${POLYMARKET_SPORTS_URL}?` +
        `tag_slug=${tag}&` +
        `closed=false&` +
        `archived=false&` +
        `active=true&` +
        `limit=${tagLimit}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'pariflow/1.0',
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const events = await response.json();
        if (Array.isArray(events)) {
          allEvents.push(...events);
        }
      }
    }

    // Remove duplicates by ID with better deduplication logic
    // Use composite key: id + title + startDate to handle edge cases
    const uniqueEvents = Array.from(
      new Map(
        allEvents.map(e => {
          const key = e.id || e.slug || `${e.title}-${e.startDate}`;
          return [key, e];
        })
      ).values()
    );

    console.log(`[Sports Sync] Deduplication: ${allEvents.length} raw → ${uniqueEvents.length} unique`);

    return uniqueEvents.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch Polymarket sports events:', error);
    return [];
  }
}

/**
 * Normalize Polymarket event to database format
 */
function normalizeEvent(event: PolymarketSportsEvent): NormalizedSportsEvent | null {
  const id = event.id || event.slug;
  if (!id) return null;

  // Skip closed/resolved markets (Polymarket knows better than time calculations)
  if ((event as any).closed === true || (event as any).active === false) {
    console.log(`[Sync] Skipping closed/inactive event: ${event.title?.substring(0, 60)}`);
    return null;
  }

  const title = event.title || 'Untitled Event';
  const description = event.description || '';

  // Parse outcome prices (probabilities) AND condition token IDs for WebSocket subscriptions
  // Prices and tokens are in the markets array, typically in the first market
  let yesOdds = 0.5;
  let noOdds = 0.5;
  let yesTokenId: string | undefined;
  let noTokenId: string | undefined;
  let clobTokenIds: string[] | undefined;

  try {
    if (event.markets && Array.isArray(event.markets) && event.markets.length > 0) {
      const market = event.markets[0];

      // Extract odds
      if (market.outcomePrices) {
        const prices = typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices;
        if (Array.isArray(prices) && prices.length >= 2) {
          yesOdds = parseFloat(prices[0]);
          noOdds = parseFloat(prices[1]);
        }
      }

      // Extract condition token IDs for WebSocket subscriptions
      if (market.clobTokenIds && Array.isArray(market.clobTokenIds)) {
        clobTokenIds = market.clobTokenIds;
        yesTokenId = market.clobTokenIds[0]; // First token is typically YES
        noTokenId = market.clobTokenIds[1];   // Second token is typically NO
      } else if (market.tokens && Array.isArray(market.tokens)) {
        // Fallback: some API responses use 'tokens' instead
        clobTokenIds = market.tokens;
        yesTokenId = market.tokens[0];
        noTokenId = market.tokens[1];
      }
    }
  } catch (e) {
    console.warn('Failed to parse market data for event', event.id, ':', e);
  }

  // Parse team names from title
  const teams = parseTeams(title);

  // Detect sports metadata
  const isEsportsEvent = isEsports({ title, description, categories: event.categories });
  const league = detectLeague({ title, description, categories: event.categories });
  const sport = detectSport({ title, description, categories: event.categories });

  // Quality validation: Must have teams OR be a recognized league event
  const hasValidMatchup = teams.teamA && teams.teamB;
  const hasValidLeague = league && league !== 'Unknown';
  const isRecognizedSport = isEsportsEvent || (sport && sport !== 'other');

  // Skip events that are not actual sports games
  if (!hasValidMatchup && !hasValidLeague) {
    // This will filter out generic predictions like "Will X happen?"
    return null;
  }

  // Additional check: recognized sport or league is required
  if (!hasValidMatchup && !isRecognizedSport) {
    return null;
  }

  // Determine category
  let category = event.category || (event.categories && event.categories[0]);
  if (!category || category.toLowerCase() === 'general') {
    category = isEsportsEvent ? 'Esports' : 'Sports';
  }

  // Parse dates - CRITICAL FIX: Extract date from slug as it's more reliable than startDate
  // Polymarket's startDate field can be inaccurate, but the slug always contains the correct date
  // Example slug: "dota2-flc-xtreme-2025-12-19" -> extract "2025-12-19"
  let startTime: Date | null = null;

  // Try to extract date from slug first (most reliable source)
  if (event.slug) {
    const slugDateMatch = event.slug.match(/(\d{4}-\d{2}-\d{2})/);
    if (slugDateMatch) {
      const slugDate = slugDateMatch[1]; // e.g., "2025-12-19"
      startTime = new Date(slugDate + 'T00:00:00Z'); // Use UTC midnight
      console.log(`[Sync] Extracted date from slug: ${slugDate} for "${title.substring(0, 40)}"`);
    }
  }

  // Fallback to API startDate if slug parsing failed
  if (!startTime && event.startDate) {
    startTime = new Date(event.startDate);
  }

  const resolutionDate = event.endDate ? new Date(event.endDate) :
    startTime ? new Date(startTime.getTime() + 24 * 60 * 60 * 1000) : // Default: 24h after start
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

  const createdAt = event.createdAt ? new Date(event.createdAt) : new Date();
  const endTime = event.endDate ? new Date(event.endDate) : null;

  // Parse volume
  const volume = parseFloat(String(event.volume || event.volumeNum || event.volume24hr || 0));

  // Game status - use Polymarket's actual status instead of time calculations
  const gameStatus = normalizeGameStatus(event.gameStatus);

  // Debug logging for event status
  if (title.includes('ENCE') || title.includes('HyperSpirit')) {
    console.log('[Sync DEBUG]', title, ':', {
      polymarketLive: event.live,
      gameStatus,
      startDate: event.startDate,
      endDate: event.endDate,
    });
  }

  // Skip ONLY finished games (but keep scheduled and live)
  if (gameStatus === 'finished') {
    console.log(`[Sync] Skipping ${gameStatus} game: ${title.substring(0, 60)}`);
    return null;
  }

  const now = new Date();

  // CRITICAL: Polymarket's event.live flag means "betting is live" (market is active),
  // NOT that the game is currently being played!
  // Only trust gameStatus === 'live' for actual live games

  // Determine if game is actually live (in progress right now)
  let live = false;

  if (gameStatus === 'live') {
    // Polymarket explicitly says the game is live
    live = true;
  } else if (startTime && endTime) {
    // Check time boundaries
    if (startTime < now && endTime > now) {
      // Game started and hasn't ended yet - likely live
      live = true;
    } else if (endTime < now) {
      // End time has passed - game is finished
      console.log(`[Sync] Game finished (endTime passed): ${title.substring(0, 60)}`);
      return null; // Skip finished games
    }
  } else if (startTime && startTime < now && !endTime) {
    // No end time - check if it started recently (within 3 hours)
    const hoursSinceStart = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceStart > 3) {
      // Started more than 3 hours ago - probably finished
      console.log(`[Sync] Game likely finished (started ${hoursSinceStart.toFixed(1)}h ago): ${title.substring(0, 60)}`);
      return null;
    }
    live = hoursSinceStart < 3;
  }

  // Classify event type based on actual status
  let eventType: string;
  if (live) {
    eventType = 'live';
  } else if (startTime && startTime > now) {
    // Game hasn't started yet - it's upcoming
    const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil <= 48) {
      eventType = 'upcoming'; // Next 48 hours
    } else {
      eventType = classifyEvent(startTime, resolutionDate);
    }
  } else if (gameStatus === 'scheduled') {
    eventType = 'upcoming';
  } else {
    eventType = classifyEvent(startTime, resolutionDate);
  }

  // Debug logging for final decision
  if (title.includes('ENCE') || title.includes('HyperSpirit')) {
    console.log('[Sync DECISION]', title, ':', {
      live,
      eventType,
      now: now.toISOString(),
      startTime: startTime?.toISOString(),
      endTime: endTime?.toISOString(),
    });
  }

  return {
    id,
    title,
    description,
    category,
    categories: event.categories?.filter(Boolean) || [category],
    resolutionDate,
    createdAt,
    imageUrl: event.image || event.icon || null,
    volume,
    betCount: 0,
    yesOdds, // Include probabilities from outcomePrices
    noOdds,  // Include probabilities from outcomePrices
    type: 'BINARY', // Most sports events are binary
    source: 'POLYMARKET',
    polymarketId: id,

    // Sports fields
    league,
    sport,
    teamA: teams.teamA,
    teamB: teams.teamB,
    score: event.score,
    period: event.period,
    elapsed: event.elapsed,
    live: live || false,
    gameStatus,
    startTime: startTime || undefined,
    isEsports: isEsportsEvent,
    eventType,

    // WebSocket subscription tokens
    yesTokenId,
    noTokenId,
    clobTokenIds,
  };
}

/**
 * POST /api/sports/sync
 * Sync sports events from Polymarket to database
 * Monitored by Sentry Crons
 */
export async function POST(request: Request) {
  // Wrap entire handler with Sentry cron monitoring
  return Sentry.withMonitor(
    CRON_MONITOR_SLUG,
    async () => {
      try {
        const start = Date.now();

        // STEP 1: Clean up stale events BEFORE syncing new data
        // Remove events that appear to be live but started >3 hours ago (likely finished or have wrong dates)
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

        const staleLiveEvents = await prisma.event.deleteMany({
          where: {
            source: 'POLYMARKET',
            live: true,
            startTime: {
              lt: threeHoursAgo,
            },
            OR: [
              { gameStatus: null },
              { gameStatus: { notIn: ['finished', 'cancelled'] } },
            ],
          },
        });

        if (staleLiveEvents.count > 0) {
          console.log(`[Sports Sync] Cleaned up ${staleLiveEvents.count} stale live events (started >3h ago)`);
        }

        // Fetch sports events from Polymarket
        console.log('[Sports Sync] Fetching events from Polymarket...');
        const polymarketEvents = await fetchPolymarketSports(500);
        console.log(`[Sports Sync] Fetched ${polymarketEvents.length} raw events`);

        // Normalize events
        const normalized = polymarketEvents
          .map(event => normalizeEvent(event))
          .filter((e): e is NormalizedSportsEvent => e !== null);

        console.log(`[Sports Sync] Normalized ${normalized.length} events`);

        // Filter out non-sports predictions (celebrity gossip, political predictions, etc.)
        const filtered = normalized.filter(event => {
          // Must have team vs team format OR be a recognized sport/league
          const hasMatchup = event.teamA && event.teamB;
          const hasLeague = event.league && event.league !== 'Unknown';
          const isRecognizedSport = event.isEsports || (event.sport && event.sport !== 'other');

          // Exclude generic predictions (questions, celebrity gossip, non-sports)
          const lowerTitle = event.title.toLowerCase();
          const isGenericPrediction =
            event.title.includes('?') ||
            lowerTitle.includes('will ') ||
            lowerTitle.includes('engaged') ||
            lowerTitle.includes('in jail') ||
            lowerTitle.includes('announce') ||
            lowerTitle.includes('retire from') ||
            lowerTitle.includes('signed by') ||
            lowerTitle.includes('traded to') ||
            (!hasMatchup && !hasLeague); // No matchup and no league = likely not sports

          const isValidSportsEvent = (hasMatchup || (hasLeague && isRecognizedSport)) && !isGenericPrediction;

          if (!isValidSportsEvent) {
            console.log(`[Sync] Filtering out: ${event.title.substring(0, 60)}`);
          }

          return isValidSportsEvent;
        });

        console.log(`[Sports Sync] After filtering: ${filtered.length} events (Esports: ${filtered.filter(e => e.isEsports).length}, Traditional: ${filtered.filter(e => !e.isEsports).length})`);

        // Get system creator ID
        const systemUser = await prisma.user.findFirst({
          where: { isAdmin: true },
          select: { id: true },
        });

        if (!systemUser) {
          console.error('[Sports Sync] No admin user found for event creation');
          return NextResponse.json(
            { error: 'No system user found' },
            { status: 500 }
          );
        }

        const creatorId = systemUser.id;

        // Upsert events to database
        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const event of filtered) {
          try {
            // Check if event exists
            const existing = await prisma.event.findUnique({
              where: { polymarketId: event.polymarketId },
            });

            if (existing) {
              // Update existing event
              await prisma.event.update({
                where: { id: existing.id },
                data: {
                  title: event.title,
                  description: event.description,
                  categories: event.categories,
                  imageUrl: event.imageUrl,
                  resolutionDate: event.resolutionDate,
                  externalVolume: scaleVolumeForStorage(event.volume),

                  // Update odds
                  yesOdds: event.yesOdds,
                  noOdds: event.noOdds,

                  // Update sports fields
                  league: event.league,
                  sport: event.sport,
                  teamA: event.teamA,
                  teamB: event.teamB,
                  score: event.score,
                  period: event.period,
                  elapsed: event.elapsed,
                  live: event.live,
                  gameStatus: event.gameStatus,
                  startTime: event.startTime,
                  isEsports: event.isEsports,
                  eventType: event.eventType,

                  updatedAt: new Date(),
                },
              });

              // Update token IDs for WebSocket subscriptions
              if (event.yesTokenId || event.noTokenId) {
                await prisma.polymarketMarketMapping.upsert({
                  where: {
                    eventId: existing.id,
                  },
                  create: {
                    eventId: existing.id,
                    yesTokenId: event.yesTokenId || '',
                    noTokenId: event.noTokenId || '',
                  },
                  update: {
                    yesTokenId: event.yesTokenId || '',
                    noTokenId: event.noTokenId || '',
                  },
                });
              }

              updated++;
            } else {
              // Create new event
              const { category, volume, betCount, yesTokenId, noTokenId, clobTokenIds, ...eventData } = event; // Remove fields that don't match schema
              const newEvent = await prisma.event.create({
                data: {
                  ...eventData,
                  externalVolume: scaleVolumeForStorage(volume),
                  externalBetCount: betCount,
                  creatorId,
                  status: 'ACTIVE',
                },
              });

              // Store token IDs for WebSocket subscriptions
              if (yesTokenId || noTokenId) {
                await prisma.polymarketMarketMapping.upsert({
                  where: {
                    eventId: newEvent.id,
                  },
                  create: {
                    eventId: newEvent.id,
                    yesTokenId: yesTokenId || '',
                    noTokenId: noTokenId || '',
                  },
                  update: {
                    yesTokenId: yesTokenId || '',
                    noTokenId: noTokenId || '',
                  },
                });
              }

              created++;
            }
          } catch (error) {
            console.error('[Sports Sync] Error processing event', event.id, ':', error);
            errors++;
          }
        }

        const duration = Date.now() - start;

        console.log(`[Sports Sync] Completed in ${duration}ms:`, {
          created,
          updated,
          errors,
          total: normalized.length,
        });

        return NextResponse.json({
          success: true,
          created,
          updated,
          errors,
          total: normalized.length,
          duration,
        });
      } catch (error) {
        console.error('[Sports Sync] Fatal error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
          { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    },
    {
      // Monitor configuration - matches vercel.json schedule (daily at 2am)
      schedule: {
        type: 'crontab',
        value: '0 2 * * *',
      },
      // Timezone for the schedule
      timezone: 'UTC',
      // Maximum expected runtime (10 minutes)
      maxRuntime: 600,
      // Checkin margin (how much early/late is acceptable)
      checkinMargin: 5,
    }
  );
}

/**
 * GET /api/sports/sync
 * Manually trigger sync (for testing/admin)
 */
export async function GET(request: Request) {
  // Check if request has admin authorization
  const authHeader = request.headers.get('authorization');

  // For now, allow GET requests (can add auth later)
  return POST(request);
}

