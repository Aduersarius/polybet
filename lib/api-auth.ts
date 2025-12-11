import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import * as crypto from 'crypto';

export interface ApiAuthResult {
  userId: string;
  accountId: string;
  permissions: string[];
  institutionalAccount: {
    id: string;
    maxOrderSize: number;
    maxDailyVolume: number;
    dailyVolume: number;
    isActive: boolean;
  };
}

// Verify API key and return authenticated user info (supports both Authorization: Bearer and X-API-Key headers)
export async function requireApiKeyAuth(request: NextRequest): Promise<ApiAuthResult> {
  let apiKey: string | null = null;

  // Check X-API-Key header first (preferred for market data APIs)
  const xApiKeyHeader = request.headers.get('x-api-key');
  if (xApiKeyHeader) {
    apiKey = xApiKeyHeader;
  } else {
    // Fallback to Authorization header
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
  }

  if (!apiKey) {
    throw new Response(JSON.stringify({ error: 'Missing API key. Use X-API-Key header or Authorization: Bearer' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!apiKey || apiKey.length !== 64) { // Assuming 64 char hex keys
    throw new Response(JSON.stringify({ error: 'Invalid API key format' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Hash the provided key for comparison
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { key: hashedKey },
    include: {
      account: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!apiKeyRecord || !apiKeyRecord.isActive) {
    throw new Response(JSON.stringify({ error: 'Invalid or inactive API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!apiKeyRecord.account.isActive) {
    throw new Response(JSON.stringify({ error: 'Institutional account is inactive' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update last used timestamp
  await prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    userId: apiKeyRecord.account.userId,
    accountId: apiKeyRecord.accountId,
    permissions: apiKeyRecord.permissions,
    institutionalAccount: {
      id: apiKeyRecord.account.id,
      maxOrderSize: apiKeyRecord.account.maxOrderSize,
      maxDailyVolume: apiKeyRecord.account.maxDailyVolume,
      dailyVolume: apiKeyRecord.account.dailyVolume,
      isActive: apiKeyRecord.account.isActive,
    },
  };
}

// Check if user has required permission
export function hasPermission(auth: ApiAuthResult, requiredPermission: string): boolean {
  return auth.permissions.includes(requiredPermission) || auth.permissions.includes('admin');
}

// Rate limiting for institutional accounts
export async function checkInstitutionalRateLimit(
  accountId: string,
  redis: any,
  limit: number = 100,
  windowMs: number = 60000
): Promise<boolean> {
  try {
    const key = `rate_limit:institutional:${accountId}`;
    const count = await redis.incr(key);

    if (count === null || typeof count === 'undefined') {
      return false; // Fail closed if Redis unavailable
    }

    if (count === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }

    return count <= limit;
  } catch (error) {
    console.error('Institutional rate limit check failed, blocking by default:', error);
    return false; // Fail closed on error
  }
}

// Volume control for institutional accounts
export async function checkVolumeLimit(auth: ApiAuthResult, orderAmount: number): Promise<void> {
  // Check order size limit
  if (orderAmount > auth.institutionalAccount.maxOrderSize) {
    throw new Response(JSON.stringify({
      error: `Order size exceeds maximum allowed: $${auth.institutionalAccount.maxOrderSize.toLocaleString()}`
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check daily volume limit (this would need to be updated after successful orders)
  const projectedVolume = auth.institutionalAccount.dailyVolume + orderAmount;
  if (projectedVolume > auth.institutionalAccount.maxDailyVolume) {
    throw new Response(JSON.stringify({
      error: `Daily volume limit would be exceeded. Current: $${auth.institutionalAccount.dailyVolume.toLocaleString()}, Limit: $${auth.institutionalAccount.maxDailyVolume.toLocaleString()}`
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}