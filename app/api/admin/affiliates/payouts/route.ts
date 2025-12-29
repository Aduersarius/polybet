import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

// For now, we'll use a simple in-memory store for payout requests
// In production, you should add an AffiliatePayout model to Prisma
interface PayoutRequest {
  id: string;
  affiliateId: string;
  affiliateName: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedAt: string;
  processedAt?: string;
  notes?: string;
}

// Temporary in-memory store (replace with database model)
// TODO: Add AffiliatePayout model to Prisma schema
let payoutRequests: PayoutRequest[] = [];

// Initialize with some example data for demonstration
if (payoutRequests.length === 0) {
  payoutRequests = [
    {
      id: 'payout_1',
      affiliateId: 'example_1',
      affiliateName: 'Example Affiliate 1',
      amount: 1250.50,
      status: 'PENDING',
      requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'payout_2',
      affiliateId: 'example_2',
      affiliateName: 'Example Affiliate 2',
      amount: 850.00,
      status: 'APPROVED',
      requestedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      processedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminAuth(req);

    // In production, fetch from database:
    // const payouts = await prisma.affiliatePayout.findMany({
    //   include: { affiliate: { select: { name: true } } },
    //   orderBy: { requestedAt: 'desc' }
    // });

    return NextResponse.json({ payouts: payoutRequests });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Admin Affiliate Payouts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payout requests' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAuth(req);
    const body = await req.json();
    const { payoutId, action } = body;

    if (!payoutId || !['APPROVE', 'REJECT', 'PAY'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // Find and update payout request
    const payoutIndex = payoutRequests.findIndex(p => p.id === payoutId);
    if (payoutIndex === -1) {
      return NextResponse.json(
        { error: 'Payout request not found' },
        { status: 404 }
      );
    }

    const payout = payoutRequests[payoutIndex];
    
    if (action === 'APPROVE') {
      payout.status = 'APPROVED';
    } else if (action === 'REJECT') {
      payout.status = 'REJECTED';
      payout.processedAt = new Date().toISOString();
    } else if (action === 'PAY') {
      if (payout.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'Payout must be approved before marking as paid' },
          { status: 400 }
        );
      }
      payout.status = 'PAID';
      payout.processedAt = new Date().toISOString();
    }

    // In production, update database:
    // await prisma.affiliatePayout.update({
    //   where: { id: payoutId },
    //   data: {
    //     status: payout.status,
    //     processedAt: payout.processedAt ? new Date(payout.processedAt) : undefined,
    //   }
    // });

    return NextResponse.json({ success: true, payout });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Admin Affiliate Payouts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update payout request' },
      { status: 500 }
    );
  }
}

// Helper function to create a payout request (for testing or future affiliate dashboard integration)
export async function createPayoutRequest(affiliateId: string, affiliateName: string, amount: number) {
  const payout: PayoutRequest = {
    id: `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    affiliateId,
    affiliateName,
    amount,
    status: 'PENDING',
    requestedAt: new Date().toISOString(),
  };
  
  payoutRequests.push(payout);
  return payout;
}

