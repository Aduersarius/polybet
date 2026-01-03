/**
 * Telegram Account Linking API
 * Verify link code and connect Telegram account to Pariflow user
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { telegramLinkingService } from '@/lib/telegram/linking-service';

/**
 * POST /api/telegram/link
 * Verify link code and link accounts
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const body = await request.json();

    if (!body.code || typeof body.code !== 'string') {
      return NextResponse.json({ error: 'Link code is required' }, { status: 400 });
    }

    // Verify and link
    const result = await telegramLinkingService.verifyLinkCode(body.code, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Account linked successfully' });
  } catch (error) {
    console.error('Error linking Telegram account:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link account' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/telegram/link
 * Unlink Telegram account
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const success = await telegramLinkingService.unlinkAccount(user.id);

    if (!success) {
      return NextResponse.json({ error: 'No linked account found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Account unlinked successfully' });
  } catch (error) {
    console.error('Error unlinking Telegram account:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unlink account' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram/link
 * Get linked account status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const linkedAccount = await telegramLinkingService.getLinkedAccount(user.id);

    if (!linkedAccount) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({
      linked: true,
      username: linkedAccount.username,
      firstName: linkedAccount.firstName,
      lastName: linkedAccount.lastName,
    });
  } catch (error) {
    console.error('Error getting linked account:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get linked account' },
      { status: 500 }
    );
  }
}

