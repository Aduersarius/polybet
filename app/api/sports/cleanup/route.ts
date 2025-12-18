export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/sports/cleanup
 * Clean up non-sports prediction events from database
 */
export async function POST(request: Request) {
  try {
    console.log('[Sports Cleanup] Starting cleanup of bad sports events...');
    
    // Delete events with Team A/B placeholders or null teams
    const badTeamsResult = await prisma.event.deleteMany({
      where: {
        source: 'POLYMARKET',
        OR: [
          { teamA: 'Team A' },
          { teamB: 'Team B' },
          { teamA: null },
          { teamB: null },
          { teamA: '' },
          { teamB: '' },
        ],
      }
    });
    
    console.log(`[Sports Cleanup] Deleted ${badTeamsResult.count} events with bad team names`);
    
    // Delete non-sports predictions (celebrity gossip, political predictions, etc.)
    const nonSportsResult = await prisma.event.deleteMany({
      where: {
        source: 'POLYMARKET',
        OR: [
          { isEsports: true },
          { sport: { not: null } }
        ],
        AND: [
          {
            OR: [
              { title: { contains: '?', mode: 'insensitive' } },
              { title: { contains: 'will ', mode: 'insensitive' } },
              { title: { contains: 'engaged', mode: 'insensitive' } },
              { title: { contains: 'in jail', mode: 'insensitive' } },
              { title: { contains: 'announce', mode: 'insensitive' } },
              { title: { contains: 'retire from', mode: 'insensitive' } },
              { title: { contains: 'signed by', mode: 'insensitive' } },
              { title: { contains: 'traded to', mode: 'insensitive' } },
            ]
          }
        ]
      }
    });
    
    console.log(`[Sports Cleanup] Deleted ${nonSportsResult.count} non-sports predictions`);
    
    // Delete finished/closed sports events older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const finishedResult = await prisma.event.deleteMany({
      where: {
        source: 'POLYMARKET',
        OR: [
          { gameStatus: 'finished' },
          { gameStatus: 'cancelled' },
          { gameStatus: 'postponed' },
          { status: 'CLOSED' },
        ],
        createdAt: { lt: oneDayAgo }
      }
    });
    
    console.log(`[Sports Cleanup] Deleted ${finishedResult.count} finished/closed events`);
    
    // Delete duplicate events (keep the most recent by createdAt)
    // Find events with duplicate polymarketId
    const duplicateGroups = await prisma.event.groupBy({
      by: ['polymarketId'],
      where: {
        source: 'POLYMARKET',
        polymarketId: { not: null },
      },
      having: {
        polymarketId: {
          _count: {
            gt: 1,
          },
        },
      },
      _count: {
        polymarketId: true,
      },
    });
    
    console.log(`[Sports Cleanup] Found ${duplicateGroups.length} groups of duplicate polymarketIds`);
    
    let duplicatesDeleted = 0;
    for (const group of duplicateGroups) {
      // Get all events with this polymarketId, sorted by createdAt desc
      const events = await prisma.event.findMany({
        where: { polymarketId: group.polymarketId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true },
      });
      
      // Keep the first (most recent), delete the rest
      if (events.length > 1) {
        const keepId = events[0].id;
        const deleteIds = events.slice(1).map(e => e.id);
        
        console.log(`[Sports Cleanup] Keeping ${events[0].title} (${keepId}), deleting ${deleteIds.length} duplicates`);
        
        const deleted = await prisma.event.deleteMany({
          where: {
            id: { in: deleteIds },
          },
        });
        
        duplicatesDeleted += deleted.count;
      }
    }
    
    console.log(`[Sports Cleanup] Deleted ${duplicatesDeleted} duplicate events`);
    
    const totalDeleted = badTeamsResult.count + nonSportsResult.count + finishedResult.count + duplicatesDeleted;
    
    return NextResponse.json({
      success: true,
      deleted: totalDeleted,
      badTeams: badTeamsResult.count,
      nonSports: nonSportsResult.count,
      finished: finishedResult.count,
      duplicates: duplicatesDeleted,
    });
  } catch (error) {
    console.error('[Sports Cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup events' },
      { status: 500 }
    );
  }
}

