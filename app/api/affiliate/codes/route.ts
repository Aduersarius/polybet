import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAffiliateAuth } from '@/lib/affiliate-auth';
import { z } from 'zod';

const createPromoCodeSchema = z.object({
  code: z.string().min(3).max(20).regex(/^[A-Z0-9]+$/i, 'Code must be alphanumeric'),
  description: z.string().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const affiliate = await requireAffiliateAuth(req);

    const promoCodes = await prisma.promoCode.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      promoCodes: promoCodes.map((pc: any) => ({
        id: pc.id,
        code: pc.code,
        description: pc.description,
        usageCount: pc.usageCount,
        maxUses: pc.maxUses,
        isActive: pc.isActive,
        expiresAt: pc.expiresAt,
        createdAt: pc.createdAt,
      }))
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Codes] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch codes' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const affiliate = await requireAffiliateAuth(req);
    const body = await req.json();
    const validated = createPromoCodeSchema.parse(body);

    // Check if code already exists
    const existing = await prisma.promoCode.findUnique({
      where: { code: validated.code.toUpperCase() }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Promo code already exists' },
        { status: 400 }
      );
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        affiliateId: affiliate.id,
        code: validated.code.toUpperCase(),
        description: validated.description || null,
        maxUses: validated.maxUses || null,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
        isActive: true,
      }
    });

    return NextResponse.json({
      success: true,
      promoCode: {
        id: promoCode.id,
        code: promoCode.code,
        description: promoCode.description,
        usageCount: promoCode.usageCount,
        maxUses: promoCode.maxUses,
        isActive: promoCode.isActive,
        expiresAt: promoCode.expiresAt,
        createdAt: promoCode.createdAt,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Codes] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create promo code' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const affiliate = await requireAffiliateAuth(req);
    const id = req.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Promo code ID is required' },
        { status: 400 }
      );
    }

    // Verify the promo code belongs to this affiliate
    const promoCode = await prisma.promoCode.findUnique({
      where: { id }
    });

    if (!promoCode || promoCode.affiliateId !== affiliate.id) {
      return NextResponse.json(
        { error: 'Promo code not found' },
        { status: 404 }
      );
    }

    // Deactivate instead of delete
    await prisma.promoCode.update({
      where: { id },
      data: { isActive: false }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Codes] Error:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate promo code' },
      { status: 500 }
    );
  }
}

