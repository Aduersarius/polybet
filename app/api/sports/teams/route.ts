export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

// In-memory cache for team data (1 hour TTL)
const teamCache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 3600000; // 1 hour

/**
 * GET /api/sports/teams
 * Fetch and cache team data from Polymarket
 * 
 * Query params:
 * - league: string (e.g., "NFL", "NBA")
 * - abbreviations: comma-separated string (e.g., "SF,KC")
 * - name: comma-separated team names
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const league = searchParams.get('league');
    const abbreviations = searchParams.get('abbreviations')?.split(',');
    const names = searchParams.get('name')?.split(',');
    
    // Build cache key
    const cacheKey = `${league || 'all'}-${abbreviations?.join(',') || ''}-${names?.join(',') || ''}`;
    
    // Check cache
    const cached = teamCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, s-maxage=3600',
        },
      });
    }
    
    // Build Polymarket API URL
    const params = new URLSearchParams();
    if (league) params.set('league', league);
    if (abbreviations) params.set('abbreviation', abbreviations.join(','));
    if (names) params.set('name', names.join(','));
    params.set('limit', '100');
    
    const url = `https://gamma-api.polymarket.com/teams?${params.toString()}`;
    
    // Fetch from Polymarket
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'polybet/1.0',
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`[Teams API] Polymarket request failed: ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch teams', status: response.status },
        { status: response.status }
      );
    }
    
    const teams = await response.json();
    
    // Cache the result
    teamCache.set(cacheKey, {
      data: teams,
      expires: Date.now() + CACHE_TTL,
    });
    
    // Clean up expired cache entries
    for (const [key, value] of teamCache.entries()) {
      if (value.expires < Date.now()) {
        teamCache.delete(key);
      }
    }
    
    return NextResponse.json(teams, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('[Teams API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Clear cache (for testing/admin)
 */
export async function DELETE(request: Request) {
  teamCache.clear();
  return NextResponse.json({ success: true, message: 'Cache cleared' });
}

