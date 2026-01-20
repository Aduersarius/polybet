/**
 * API Key utility functions for key generation, hashing, and rotation
 */

import * as crypto from 'crypto';
import { prisma } from './prisma';
import { logger } from './logger';

const isProduction = process.env.NODE_ENV === 'production';
const API_KEY_SALT = process.env.API_KEY_SALT;

if (!API_KEY_SALT) {
  logger.warn('[API-KEY] API_KEY_SALT not set - API key operations will fail');
}

/**
 * Generates a new API key (64 character hex string)
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes an API key using PBKDF2 (more secure than SHA-256)
 * Uses 100,000 iterations for key stretching
 */
export function hashApiKey(apiKey: string): string {
  if (!API_KEY_SALT) {
    throw new Error('API_KEY_SALT must be set in production');
  }

  return crypto.pbkdf2Sync(apiKey, API_KEY_SALT, 100000, 32, 'sha256').toString('hex');
}

/**
 * Verifies an API key against a stored hash
 */
export function verifyApiKey(apiKey: string, storedHash: string): boolean {
  try {
    const computedHash = hashApiKey(apiKey);
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch (error) {
    logger.error('[API-KEY] Error verifying API key:', error);
    return false;
  }
}

/**
 * Rotates an API key - generates new key and optionally revokes old one
 */
export async function rotateApiKey(
  keyId: string,
  revokeOldKey: boolean = true
): Promise<{ newKey: string; newKeyId: string }> {
  try {
    const oldKey = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: { account: true }
    });

    if (!oldKey) {
      throw new Error('API key not found');
    }

    // Generate new key
    const newKey = generateApiKey();
    const hashedKey = hashApiKey(newKey);

    // Create new API key record
    const newKeyRecord = await prisma.apiKey.create({
      data: {
        key: hashedKey,
        accountId: oldKey.accountId,
        permissions: oldKey.permissions,
        isActive: true,
        // Copy metadata from old key
        name: `${oldKey.name || 'API Key'} (rotated)`,
        lastUsedAt: null,
      }
    });

    // Optionally revoke old key
    if (revokeOldKey) {
      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false }
      });
      logger.info(`[API-KEY] Rotated and revoked API key: ${keyId} -> ${newKeyRecord.id}`);
    } else {
      logger.info(`[API-KEY] Created new API key for rotation: ${newKeyRecord.id} (old key ${keyId} still active)`);
    }

    return {
      newKey, // Return plaintext key (only time it's available)
      newKeyId: newKeyRecord.id
    };
  } catch (error) {
    logger.error('[API-KEY] Error rotating API key:', error);
    throw error;
  }
}

/**
 * Sets expiration date for an API key
 */
export async function setApiKeyExpiration(
  keyId: string,
  expirationDate: Date
): Promise<void> {
  try {
    // Note: This assumes the ApiKey model has an expirationDate field
    // If not, you'll need to add it to the schema
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { expirationDate } as any
    });
    logger.info(`[API-KEY] Set expiration for key ${keyId}: ${expirationDate.toISOString()}`);
  } catch (error) {
    logger.error('[API-KEY] Error setting API key expiration:', error);
    throw error;
  }
}

/**
 * Revokes an API key
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false }
    });
    logger.info(`[API-KEY] Revoked API key: ${keyId}`);
  } catch (error) {
    logger.error('[API-KEY] Error revoking API key:', error);
    throw error;
  }
}


