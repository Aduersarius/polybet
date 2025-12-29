import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth(req);
    const { id } = await params;

    const affiliate = await prisma.affiliate.findUnique({
      where: { id }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    // Toggle status
    await prisma.affiliate.update({
      where: { id },
      data: {
        isActive: !affiliate.isActive
      }
    });

    return NextResponse.json({
      success: true,
      isActive: !affiliate.isActive
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Admin Toggle Affiliate] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update affiliate status' },
      { status: 500 }
    );
  }
}

