export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/sports
 * Query sports events from database with filtering
 * 
 * Query params:
 * - filter: 'all' | 'live' | 'upcoming' | 'esports' | 'traditional'
 * - sport: specific sport category (e.g., 'cs2', 'nfl', 'nba', 'lol', etc.)
 * - limit: number (default: 100)
 * - offset: number (default: 0)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const sport = searchParams.get('sport'); // New parameter
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    // Build where clause based on filter
    const where: any = {
      status: 'ACTIVE',
      OR: [
        { isEsports: true },
        { sport: { not: null } },
      ],
      // Filter out events with placeholder team names
      teamA: { not: null, notIn: ['Team A', 'Team B', ''] },
      teamB: { not: null, notIn: ['Team A', 'Team B', ''] },
      // Filter out ONLY explicitly finished/cancelled games (allow null gameStatus)
      AND: [
        {
          OR: [
            { gameStatus: null },
            { gameStatus: { notIn: ['finished', 'cancelled'] } },
          ]
        }
      ],
    };
    
    // Apply sport-specific filter (e.g., cs2, nfl, nba)
    if (sport && sport !== 'popular') {
      // Map common sport IDs to database values
      // CS2/esports events have: sport="esports", isEsports=true
      // Traditional sports have: sport="football"/"basketball"/etc, league="NFL"/"NBA"/etc
      const sportMapping: Record<string, any> = {
        // Esports - filter by isEsports flag AND optionally by title
        'cs2': { isEsports: true, title: { contains: 'Counter-Strike', mode: 'insensitive' } },
        'lol': { isEsports: true, title: { contains: 'League of Legends', mode: 'insensitive' } },
        'dota2': { isEsports: true, title: { contains: 'Dota', mode: 'insensitive' } },
        'rocket-league': { isEsports: true, title: { contains: 'Rocket League', mode: 'insensitive' } },
        
        // Traditional sports - filter by league
        'nfl': { league: 'NFL' },
        'nba': { league: 'NBA' },
        'nhl': { league: 'NHL' },
        'ufc': { league: 'UFC' },
        'cfb': { sport: 'football', title: { contains: 'College', mode: 'insensitive' } },
        
        // Soccer leagues
        'epl': { league: 'Premier League' },
        'la-liga': { league: 'La Liga' },
        'bundesliga': { league: 'Bundesliga' },
        'serie-a': { league: 'Serie A' },
        
        // Other sports by sport field
        'football': { sport: 'soccer' },
        'cricket': { sport: 'cricket' },
        'tennis': { sport: 'tennis' },
        'golf': { sport: 'golf' },
      };
      
      const sportFilter = sportMapping[sport.toLowerCase()];
      if (sportFilter) {
        // Merge sport-specific filters into where clause
        // Keep the existing OR clause for sports/esports base filter
        Object.keys(sportFilter).forEach(key => {
          where[key] = sportFilter[key];
        });
      }
    }
    
    // Apply filter
    switch (filter) {
      case 'live':
        // Include actual live games (eventType='live') OR old events marked as live
        where.AND = [
          { live: true },
          {
            OR: [
              { eventType: 'live' },
              { eventType: null }, // Legacy events
            ]
          }
        ];
        break;
        
      case 'upcoming':
        // Include upcoming games (eventType='upcoming') OR old non-live events
        where.AND = [
          { live: false },
          { resolutionDate: { gte: new Date() } },
          {
            OR: [
              { eventType: 'upcoming' },
              { eventType: null }, // Legacy events
            ]
          }
        ];
        break;
        
      case 'esports':
        where.isEsports = true;
        // Exclude only explicit 'futures', allow null
        where.AND = [
          {
            OR: [
              { eventType: { not: 'futures' } },
              { eventType: null },
            ]
          }
        ];
        break;
        
      case 'traditional':
        where.isEsports = false;
        where.OR = [
          { sport: { not: null } },
        ];
        // Exclude only explicit 'futures', allow null
        where.AND = [
          {
            OR: [
              { eventType: { not: 'futures' } },
              { eventType: null },
            ]
          }
        ];
        break;
        
      case 'all':
        // Show all except explicit long-term futures
        where.AND = [
          {
            OR: [
              { eventType: { not: 'futures' } },
              { eventType: null },
            ]
          }
        ];
        break;
    }
    
    // Query events
    const events = await prisma.event.findMany({
      where,
      orderBy: [
        { live: 'desc' },          // Live events first
        { startTime: 'asc' },      // Then by start time (soonest first)
        { externalVolume: 'desc' }, // Then by volume
        { createdAt: 'desc' },     // Finally by creation date
      ],
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        description: true,
        categories: true,
        imageUrl: true,
        resolutionDate: true,
        createdAt: true,
        externalVolume: true,
        externalBetCount: true,
        yesOdds: true,
        noOdds: true,
        type: true,
        polymarketId: true, // Add for duplicate detection
        
        // Sports fields
        league: true,
        sport: true,
        teamA: true,
        teamB: true,
        teamALogo: true,
        teamBLogo: true,
        score: true,
        period: true,
        elapsed: true,
        live: true,
        gameStatus: true,
        startTime: true,
        isEsports: true,
        
        // Include outcomes for multi-outcome events
        outcomes: {
          select: {
            id: true,
            name: true,
            probability: true,
            color: true,
          },
        },
      },
    });
    
    // Count total for pagination
    const total = await prisma.event.count({ where });
    
    // Debug logging to understand duplicate issues
    console.log('[Sports API] Query results:', {
      totalCount: total,
      returnedCount: events.length,
      filter,
      sport,
      sampleTitles: events.slice(0, 5).map((e: any) => ({ title: e.title, polymarketId: e.polymarketId })),
    });
    
    // Check for duplicates by polymarketId
    if (sport === 'cs2') {
      const polymarketIds = events.map((e: any) => e.polymarketId).filter(Boolean);
      const uniqueIds = new Set(polymarketIds);
      if (polymarketIds.length !== uniqueIds.size) {
        console.warn('[Sports API] DUPLICATES DETECTED:', {
          totalEvents: events.length,
          uniquePolymarketIds: uniqueIds.size,
          duplicateCount: polymarketIds.length - uniqueIds.size,
        });
      }
    }
    
    // Transform events to match EventCard2 format (remove polymarketId from output)
    const transformed = events.map((event: any) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.isEsports ? 'Esports' : 'Sports',
      categories: event.categories,
      resolutionDate: event.resolutionDate.toISOString(),
      createdAt: event.createdAt.toISOString(),
      imageUrl: event.imageUrl,
      volume: event.externalVolume || 0,
      betCount: event.externalBetCount || 0,
      yesOdds: event.yesOdds,
      noOdds: event.noOdds,
      type: event.type,
      outcomes: event.outcomes,
      
      // Sports metadata
      league: event.league,
      sport: event.sport,
      teamA: event.teamA,
      teamB: event.teamB,
      teamALogo: event.teamALogo,
      teamBLogo: event.teamBLogo,
      score: event.score,
      period: event.period,
      elapsed: event.elapsed,
      live: event.live,
      gameStatus: event.gameStatus,
      startTime: event.startTime?.toISOString(),
      isEsports: event.isEsports,
    }));
    
    return NextResponse.json({
      events: transformed,
      total,
      limit,
      offset,
      hasMore: offset + events.length < total,
    }, {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[Sports API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sports events', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

