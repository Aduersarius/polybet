import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import * as crypto from 'crypto';
import { logger } from './logger';

const isProduction = process.env.NODE_ENV === 'production';

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

  // Hash the provided key for comparison using PBKDF2 (more secure than SHA-256 for passwords/keys)
  // Using PBKDF2 with SHA-256, 100,000 iterations, and salt from env
  // This is more secure than simple SHA-256 hashing
  const salt = process.env.API_KEY_SALT || (isProduction ? undefined : 'dev-salt-change-in-production');
  if (!salt) {
    logger.error('[API-AUTH] API_KEY_SALT not configured');
    throw new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const hashedKey = crypto.pbkdf2Sync(apiKey, salt, 100000, 32, 'sha256').toString('hex');

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

  // Check if key has expired (if expirationDate field exists)
  if ((apiKeyRecord as any).expirationDate) {
    const expirationDate = new Date((apiKeyRecord as any).expirationDate);
    if (expirationDate < new Date()) {
      logger.warn(`[API-AUTH] Expired API key attempted: ${apiKeyRecord.id}`);
      throw new Response(JSON.stringify({ error: 'API key has expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (!apiKeyRecord.account.isActive) {
    throw new Response(JSON.stringify({ error: 'Institutional account is inactive' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update last used timestamp and usage count
  await prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { 
      lastUsedAt: new Date(),
      // Increment usage count if field exists
      ...((apiKeyRecord as any).usageCount !== undefined && {
        usageCount: { increment: 1 }
      })
    },
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
    if (!redis) {
      return false; // Fail closed if Redis unavailable
    }

    // Check if Redis connection is actually ready
    const status = redis.status;
    if (!status || status !== 'ready') {
      return false; // Fail closed if not ready
    }

    const key = `rate_limit:institutional:${accountId}`;
    const count = await redis.incr(key);

    if (count === null || typeof count === 'undefined') {
      return false; // Fail closed if Redis unavailable
    }

    if (count === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }

    return count <= limit;
  } catch (error: any) {
    const isConnectionError = error?.message?.includes('Connection is closed') || 
                              error?.message?.includes('connect') ||
                              error?.message?.includes('ECONNREFUSED');
    const isProd = process.env.NODE_ENV === 'production';
    
    if (!isConnectionError || isProd) {
      logger.error('Institutional rate limit check failed, blocking by default:', error);
    }
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