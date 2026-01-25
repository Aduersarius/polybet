import { trustedOrigins } from './auth';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { AppError } from './error-handler';

const prod = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set(trustedOrigins);

// CSRF token secret (MUST be in env in production)
const CSRF_SECRET = process.env.CSRF_SECRET;

function originFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

/**
 * Validates origin/referer headers for CSRF protection
 * This is the primary defense against CSRF attacks
 */
export function assertSameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    const refererOrigin = originFromUrl(request.headers.get('referer'));

    // Prefer Origin header; fall back to Referer if absent.
    const candidate = origin || refererOrigin;

    if (!candidate) {
        // In production, always require origin
        // In development, we allow missing origin only for same-origin requests (no origin header means same-origin)
        // But we still validate if origin is present
        if (prod) {
            throw new AppError('Origin required', 403);
        }
        // In dev, allow same-origin requests (no origin header) but still validate if present
        return;
    }

    if (!allowedOrigins.has(candidate)) {
        throw new AppError('CSRF check failed', 403);
    }
}

/**
 * Generates a CSRF token for additional security layer
 * Tokens are HMAC-signed to prevent tampering
 */
export function generateCsrfToken(): string {
    if (!CSRF_SECRET) {
        throw new Error('CSRF_SECRET must be set in production');
    }

    const token = randomBytes(32).toString('hex');
    const timestamp = Date.now().toString();
    const data = `${token}:${timestamp}`;

    const hmac = createHmac('sha256', CSRF_SECRET);
    hmac.update(data);
    const signature = hmac.digest('hex');

    return `${data}:${signature}`;
}

/**
 * Validates a CSRF token
 * Returns true if token is valid, false otherwise
 */
export function validateCsrfToken(token: string, maxAgeMs: number = 3600000): boolean {
    if (!CSRF_SECRET) {
        // In dev without secret, skip token validation (origin check still applies)
        return true;
    }

    try {
        const parts = token.split(':');
        if (parts.length !== 3) {
            return false;
        }

        const [tokenPart, timestamp, signature] = parts;

        // Check token age
        const tokenAge = Date.now() - parseInt(timestamp, 10);
        if (tokenAge > maxAgeMs || tokenAge < 0) {
            return false;
        }

        // Verify signature
        const data = `${tokenPart}:${timestamp}`;
        const hmac = createHmac('sha256', CSRF_SECRET);
        hmac.update(data);
        const expectedSignature = hmac.digest('hex');

        // Constant-time comparison to prevent timing attacks
        const signatureBuffer = Buffer.from(signature, 'hex');
        const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

        if (signatureBuffer.length !== expectedSignatureBuffer.length) {
            return false;
        }

        return timingSafeEqual(signatureBuffer, expectedSignatureBuffer);
    } catch {
        return false;
    }
}

/**
 * Enhanced CSRF protection with optional token validation
 * Always validates origin, optionally validates token if provided
 */
export function assertCsrfProtection(request: Request, requireToken: boolean = false) {
    // Always validate origin (primary defense)
    assertSameOrigin(request);

    // Optionally validate CSRF token (additional layer)
    if (requireToken) {
        const token = request.headers.get('x-csrf-token');
        if (!token || !validateCsrfToken(token)) {
            throw new AppError('Invalid CSRF token', 403);
        }
    }
}
