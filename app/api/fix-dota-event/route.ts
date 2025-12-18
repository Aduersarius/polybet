import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fix-dota-event
 * Immediately fix the Dota 2 Falcons vs Xtreme event date
 */
export async function GET() {
  try {
    console.log('🔧 Fixing Dota 2 event date...');
    
    // Step 1: Delete stale event
    const deleted = await prisma.event.deleteMany({
      where: {
        OR: [
          {
            AND: [
              { title: { contains: 'Falcons', mode: 'insensitive' } },
              { title: { contains: 'Xtreme', mode: 'insensitive' } },
            ]
          },
          { polymarketId: '107656' }
        ]
      }
    });
    
    console.log(`✅ Deleted ${deleted.count} stale event(s)`);
    
    // Step 2: Fetch fresh from Polymarket
    const response = await fetch('https://gamma-api.polymarket.com/events?tag_slug=dota-2&closed=false&active=true&limit=50');
    const events = await response.json();
    
    const falconsEvent = events.find((e: any) => 
      e.title?.toLowerCase().includes('falcons') && 
      e.title?.toLowerCase().includes('xtreme')
    );
    
    if (!falconsEvent) {
      return NextResponse.json({
        success: false,
        error: 'Event not found on Polymarket',
      }, { status: 404 });
    }
    
    console.log('📥 Found event:', {
      id: falconsEvent.id,
      slug: falconsEvent.slug,
      title: falconsEvent.title,
    });
    
    // Step 3: Extract correct date from slug
    const slugDateMatch = falconsEvent.slug.match(/(\d{4}-\d{2}-\d{2})/);
    const correctDate = slugDateMatch ? slugDateMatch[1] : falconsEvent.startDate;
    
    console.log(`✨ Correct date from slug: ${correctDate}`);
    
    // Step 4: Parse odds
    let yesOdds = 0.5, noOdds = 0.5;
    if (falconsEvent.markets?.[0]?.outcomePrices) {
      const prices = JSON.parse(falconsEvent.markets[0].outcomePrices);
      yesOdds = parseFloat(prices[0]);
      noOdds = parseFloat(prices[1]);
    }
    
    // Step 5: Get system user
    const systemUser = await prisma.user.findFirst({ 
      where: { email: 'system@polybet.com' } 
    });
    
    if (!systemUser) {
      return NextResponse.json({
        success: false,
        error: 'System user not found',
      }, { status: 500 });
    }
    
    // Step 6: Create event with CORRECT date
    const newEvent = await prisma.event.create({
      data: {
        title: falconsEvent.title,
        description: falconsEvent.description || '',
        category: 'Esports',
        categories: ['Esports', 'Dota 2'],
        status: 'ACTIVE',
        type: 'BINARY',
        source: 'POLYMARKET',
        polymarketId: falconsEvent.id,
        startTime: new Date(correctDate + 'T00:00:00Z'), // CORRECT DATE: Dec 19
        resolutionDate: falconsEvent.endDate 
          ? new Date(falconsEvent.endDate) 
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: systemUser.id,
        yesOdds,
        noOdds,
        externalVolume: parseFloat(falconsEvent.volume || 0),
        externalBetCount: 0,
        live: false, // Not live yet - it's Dec 19
        eventType: 'upcoming',
        isEsports: true,
        sport: 'Dota 2',
        league: 'Professional',
        teamA: 'Team Falcons',
        teamB: 'Xtreme Gaming',
      }
    });
    
    console.log('✅ Created event with correct date:', {
      id: newEvent.id,
      title: newEvent.title,
      startTime: newEvent.startTime,
      live: newEvent.live,
    });
    
    return NextResponse.json({
      success: true,
      message: 'Event fixed successfully! Refresh /sports page to see changes.',
      event: {
        id: newEvent.id,
        title: newEvent.title,
        startTime: newEvent.startTime,
        correctDate: correctDate,
        live: newEvent.live,
        eventType: newEvent.eventType,
      },
      deleted: deleted.count,
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

