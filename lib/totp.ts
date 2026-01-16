import crypto from 'crypto';

/**
 * Converts a secret to a Buffer for TOTP generation.
 * Supports multiple formats:
 * 1. Base32 (standard TOTP format, uppercase A-Z and 2-7)
 * 2. Raw string (used by Better Auth - treated as UTF-8 bytes)
 */
function secretToBuffer(secret: string): Buffer {
    // Remove any whitespace
    const cleaned = secret.trim();

    // Check if it's base32 format (only A-Z and 2-7, optionally with = padding)
    const isBase32 = /^[A-Z2-7]+=*$/i.test(cleaned.replace(/[\s-]/g, '').toUpperCase());

    if (isBase32 && cleaned.length >= 16) {
        return base32ToBuffer(cleaned);
    }

    // For Better Auth secrets (random 32-char strings like "BbRZn-vC3jR2xBrud5yJdoiSST31nfvE")
    // Treat as raw UTF-8 bytes
    return Buffer.from(cleaned, 'utf-8');
}

function base32ToBuffer(secret: string): Buffer {
    const cleaned = secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    let bits = '';
    for (const char of cleaned) {
        const val = alphabet.indexOf(char);
        if (val === -1) throw new Error(`Invalid base32 character: ${char}`);
        bits += val.toString(2).padStart(5, '0');
    }

    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }

    return Buffer.from(bytes);
}

function generateTotp(secret: Buffer, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    // nosemgrep: javascript.node-stdlib.cryptography.crypto-weak-algorithm.crypto-weak-algorithm
    const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return (code % 1_000_000).toString().padStart(6, '0');
}

/**
 * Verifies a TOTP code against a secret.
 * @param code - The 6-digit code to verify
 * @param secret - The secret (base32 or raw string)
 * @param window - Number of time steps to check before/after current (default 1)
 */
export function verifyTotpCode(code: string, secret: string, window: number = 1): boolean {
    const sanitized = (code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(sanitized)) return false;

    let secretBuffer: Buffer;
    try {
        secretBuffer = secretToBuffer(secret);
    } catch {
        return false;
    }

    const timestep = Math.floor(Date.now() / 30000);
    for (let i = -window; i <= window; i++) {
        if (generateTotp(secretBuffer, timestep + i) === sanitized) {
            return true;
        }
    }
    return false;
}

/**
 * Generates the current TOTP code for a secret.
 * @param secret - The secret (base32 or raw string)
 */
export function generateTotpCode(secret: string): string {
    const secretBuffer = secretToBuffer(secret);
    const timestep = Math.floor(Date.now() / 30000);
    return generateTotp(secretBuffer, timestep);
}
