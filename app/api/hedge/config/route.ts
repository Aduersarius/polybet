/**
 * Hedge Configuration Management API
 * 
 * Allows updating hedge settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { hedgeManager } from '@/lib/hedge-manager';
import { requireAdminAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request);
    await hedgeManager.loadConfig();
    const config = hedgeManager.getConfig();

    return NextResponse.json(config);
  } catch (error) {
    console.error('[Hedge Config] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hedge configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireAdminAuth(request);
    const body = await request.json();
    const { key, value, updatedBy } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Missing key or value' },
        { status: 400 }
      );
    }

    // Validate key
    const validKeys = [
      'enabled',
      'minSpreadBps',
      'maxSlippageBps',
      'maxUnhedgedExposure',
      'maxPositionSize',
      'hedgeTimeoutMs',
      'retryAttempts',
    ];

    if (!validKeys.includes(key)) {
      return NextResponse.json(
        { error: `Invalid key. Valid keys are: ${validKeys.join(', ')}` },
        { status: 400 }
      );
    }

    // Update configuration
    await hedgeManager.updateConfig(key, value, updatedBy);

    // Return updated config
    await hedgeManager.loadConfig();
    const config = hedgeManager.getConfig();

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('[Hedge Config] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update hedge configuration' },
      { status: 500 }
    );
  }
}

