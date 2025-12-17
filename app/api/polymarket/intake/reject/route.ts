import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth(request);
    const body = await request.json();
    const { polymarketId, reason, updatedBy } = body;

    if (!polymarketId) {
      return NextResponse.json(
        { error: 'polymarketId is required' },
        { status: 400 }
      );
    }

    const { prisma } = await import('@/lib/prisma');

    // Try to find existing mapping by polymarketId
    const existing = await prisma.polymarketMarketMapping.findFirst({
      where: { polymarketId },
    });

    const data: any = {
      internalEventId: existing?.internalEventId || `rejected-${polymarketId}`,
      polymarketId,
      isActive: false,
    };

    try {
      data.status = 'rejected';
      data.decisionAt = new Date();
      data.updatedBy = updatedBy || 'admin';
      data.notes = reason || null;
    } catch {
      // ignore if schema not migrated
    }

    const mapping = existing
      ? await prisma.polymarketMarketMapping.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.polymarketMarketMapping.create({ data });

    return NextResponse.json({ success: true, mapping });
  } catch (error) {
    console.error('[Polymarket Intake] reject failed', error);
    return NextResponse.json(
      { error: 'Failed to reject Polymarket market' },
      { status: 500 }
    );
  }
}

