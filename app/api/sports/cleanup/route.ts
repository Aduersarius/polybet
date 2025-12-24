export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deleteEventImagesFromBlob } from '@/lib/event-image-blob';

/**
 * Helper to get image URLs from events before deleting them
 */
async function getEventImageUrls(whereClause: any): Promise<string[]> {
  const events = await prisma.event.findMany({
    where: whereClause,
    select: { imageUrl: true },
  });
  return events.map((e: { imageUrl: string | null }) => e.imageUrl).filter((url: string | null): url is string => !!url);
}

/**
 * POST /api/sports/cleanup
 * Clean up non-sports prediction events from database
 */
export async function POST(request: Request) {
  try {
    console.log('[Sports Cleanup] Starting cleanup of bad sports events...');

    let totalImagesDeleted = 0;

    // Delete events with Team A/B placeholders or null teams
    const badTeamsWhere = {
      source: 'POLYMARKET',
      OR: [
        { teamA: 'Team A' },
        { teamB: 'Team B' },
        { teamA: null },
        { teamB: null },
        { teamA: '' },
        { teamB: '' },
      ],
    };

    // Get image URLs before deleting
    const badTeamsImages = await getEventImageUrls(badTeamsWhere);
    const badTeamsResult = await prisma.event.deleteMany({ where: badTeamsWhere });
    if (badTeamsImages.length > 0) {
      const deleted = await deleteEventImagesFromBlob(badTeamsImages);
      totalImagesDeleted += deleted;
    }

    console.log(`[Sports Cleanup] Deleted ${badTeamsResult.count} events with bad team names`);

    // Delete non-sports predictions (celebrity gossip, political predictions, etc.)
    const nonSportsWhere = {
      source: 'POLYMARKET',
      OR: [
        { isEsports: true },
        { sport: { not: null } }
      ],
      AND: [
        {
          OR: [
            { title: { contains: '?', mode: 'insensitive' as const } },
            { title: { contains: 'will ', mode: 'insensitive' as const } },
            { title: { contains: 'engaged', mode: 'insensitive' as const } },
            { title: { contains: 'in jail', mode: 'insensitive' as const } },
            { title: { contains: 'announce', mode: 'insensitive' as const } },
            { title: { contains: 'retire from', mode: 'insensitive' as const } },
            { title: { contains: 'signed by', mode: 'insensitive' as const } },
            { title: { contains: 'traded to', mode: 'insensitive' as const } },
          ]
        }
      ]
    };

    const nonSportsImages = await getEventImageUrls(nonSportsWhere);
    const nonSportsResult = await prisma.event.deleteMany({ where: nonSportsWhere });
    if (nonSportsImages.length > 0) {
      const deleted = await deleteEventImagesFromBlob(nonSportsImages);
      totalImagesDeleted += deleted;
    }

    console.log(`[Sports Cleanup] Deleted ${nonSportsResult.count} non-sports predictions`);

    // Delete finished/closed sports events older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const finishedWhere = {
      source: 'POLYMARKET',
      OR: [
        { gameStatus: 'finished' },
        { gameStatus: 'cancelled' },
        { gameStatus: 'postponed' },
        { status: 'CLOSED' },
      ],
      createdAt: { lt: oneDayAgo }
    };

    const finishedImages = await getEventImageUrls(finishedWhere);
    const finishedResult = await prisma.event.deleteMany({ where: finishedWhere });
    if (finishedImages.length > 0) {
      const deleted = await deleteEventImagesFromBlob(finishedImages);
      totalImagesDeleted += deleted;
    }

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
        select: { id: true, title: true, createdAt: true, imageUrl: true },
      });

      // Keep the first (most recent), delete the rest
      if (events.length > 1) {
        const keepId = events[0].id;
        const deleteIds = events.slice(1).map((e: { id: string }) => e.id);
        const deleteImages = events.slice(1).map((e: { imageUrl: string | null }) => e.imageUrl);

        console.log(`[Sports Cleanup] Keeping ${events[0].title} (${keepId}), deleting ${deleteIds.length} duplicates`);

        // Delete images from duplicates
        if (deleteImages.length > 0) {
          const deleted = await deleteEventImagesFromBlob(deleteImages);
          totalImagesDeleted += deleted;
        }

        const deleted = await prisma.event.deleteMany({
          where: {
            id: { in: deleteIds },
          },
        });

        duplicatesDeleted += deleted.count;
      }
    }

    console.log(`[Sports Cleanup] Deleted ${duplicatesDeleted} duplicate events`);
    console.log(`[Sports Cleanup] Deleted ${totalImagesDeleted} images from Blob storage`);

    const totalDeleted = badTeamsResult.count + nonSportsResult.count + finishedResult.count + duplicatesDeleted;

    return NextResponse.json({
      success: true,
      deleted: totalDeleted,
      imagesDeleted: totalImagesDeleted,
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
