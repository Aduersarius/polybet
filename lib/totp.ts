import crypto from 'crypto';

function base32ToBuffer(secret: string): Buffer {
    const cleaned = secret.replace(/[\s-]/g, '').toUpperCase();
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    let bits = '';
    for (const char of cleaned) {
        const val = alphabet.indexOf(char);
        if (val === -1) throw new Error('Invalid base32 character');
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

    const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return (code % 1_000_000).toString().padStart(6, '0');
}

export function verifyTotpCode(code: string, secret: string, window: number = 1): boolean {
    const sanitized = (code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(sanitized)) return false;

    let secretBuffer: Buffer;
    try {
        secretBuffer = base32ToBuffer(secret);
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
