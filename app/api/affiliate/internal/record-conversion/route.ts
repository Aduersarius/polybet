import { NextRequest, NextResponse } from 'next/server';
import { updateReferralStats, updateReferralTradeStats } from '@/lib/affiliate-tracking';
import { z } from 'zod';

const recordConversionSchema = z.object({
  userId: z.string(),
  eventType: z.enum(['SIGNUP', 'FIRST_DEPOSIT', 'DEPOSIT', 'TRADE']),
  amount: z.number().optional(),
  revenue: z.number().optional(), // Platform profit (for admin tracking only)
});

/**
 * Internal API - called by platform to record user actions
 * Updates referral stats (counts and amounts, no commission)
 */
export async function POST(req: NextRequest) {
  try {
    // This is an internal API - should be protected by API key or internal network
    // For now, we'll allow it but in production should add proper authentication
    const body = await req.json();
    const validated = recordConversionSchema.parse(body);

    const { userId, eventType, amount, revenue } = validated;

    if (eventType === 'SIGNUP') {
      // Signup is handled separately in signup flow
      // This endpoint is mainly for deposits and trades
      return NextResponse.json({ success: true, message: 'Signup tracking handled separately' });
    }

    if (eventType === 'FIRST_DEPOSIT' || eventType === 'DEPOSIT') {
      if (!amount || amount <= 0) {
        return NextResponse.json(
          { error: 'Amount is required for deposit events' },
          { status: 400 }
        );
      }

      await updateReferralStats(userId, {
        depositAmount: amount,
        isFirstDeposit: eventType === 'FIRST_DEPOSIT'
      });

      return NextResponse.json({ success: true });
    }

    if (eventType === 'TRADE') {
      if (!amount || amount <= 0) {
        return NextResponse.json(
          { error: 'Volume is required for trade events' },
          { status: 400 }
        );
      }

      await updateReferralTradeStats(userId, {
        volume: amount,
        revenue: revenue || 0 // Platform profit (admin tracking only)
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid event type' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }
    console.error('[Affiliate Record Conversion] Error:', error);
    return NextResponse.json(
      { error: 'Failed to record conversion' },
      { status: 500 }
    );
  }
}

