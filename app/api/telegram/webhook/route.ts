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
    console.log('[Webhook] Received Telegram webhook request');
    
    // Verify webhook secret
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    
    if (WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET) {
      console.warn('[Webhook] Invalid webhook secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse update
    const update: TelegramUpdate = await request.json();
    console.log('[Webhook] Parsed update, message text:', update.message?.text || 'no text');

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
