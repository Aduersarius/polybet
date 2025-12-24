/**
 * Telegram Webhook Handler
 * Receives and processes updates from Telegram Bot API
 */

import { NextRequest, NextResponse } from 'next/server';
import { telegramService } from '@/lib/telegram/telegram-service';
import type { TelegramUpdate } from '@/lib/telegram/types';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

/**
 * POST /api/telegram/webhook
 * Receive Telegram updates via webhook
 */
export async function POST(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const host = request.headers.get('host') || '';
    const forwardedHost = request.headers.get('x-forwarded-host') || '';
    
    console.log('[Webhook] Received Telegram webhook request');
    console.log('[Webhook] Host:', host);
    console.log('[Webhook] Forwarded-Host:', forwardedHost);
    console.log('[Webhook] URL:', url.toString());
    console.log('[Webhook] Headers:', JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2));
    
    // Handle www redirect by returning 200 immediately (prevent redirect loop)
    // If request comes via www, we still process it but log the issue
    if (host.startsWith('www.') || forwardedHost.startsWith('www.')) {
      console.warn('[Webhook] Request received via www subdomain - consider updating webhook URL to non-www');
    }
    
    // Verify webhook secret
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    
    if (WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET) {
      console.warn('[Webhook] Invalid webhook secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse update
    let update: TelegramUpdate;
    try {
      update = await request.json();
      console.log('[Webhook] Parsed update, message text:', update.message?.text || 'no text');
    } catch (parseError) {
      console.error('[Webhook] Failed to parse JSON:', parseError);
      // Return 200 to prevent Telegram from disabling webhook
      return NextResponse.json({ ok: true });
    }

    // Process update asynchronously (don't block webhook response)
    telegramService.processUpdate(update).catch((error) => {
      console.error('[Webhook] Error processing Telegram update:', error);
      if (error instanceof Error) {
        console.error('[Webhook] Error stack:', error.stack);
      }
    });

    // Return 200 OK immediately (Telegram requires fast response)
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Webhook error:', error);
    if (error instanceof Error) {
      console.error('[Webhook] Error stack:', error.stack);
    }
    // Still return 200 to prevent Telegram from disabling webhook
    return NextResponse.json({ ok: true });
  }
}

/**
 * GET /api/telegram/webhook
 * Check webhook status
 */
export async function GET(request: NextRequest) {
  try {
    const info = await telegramService.getWebhookInfo();
    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get webhook info' },
      { status: 500 }
    );
  }
}
