import { trustedOrigins } from './auth';

const prod = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set(trustedOrigins);

function originFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

export function assertSameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    const refererOrigin = originFromUrl(request.headers.get('referer'));

    // Prefer Origin header; fall back to Referer if absent.
    const candidate = origin || refererOrigin;

    if (!candidate) {
        if (prod) {
            throw new Response(JSON.stringify({ error: 'Origin required' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return; // allow missing origin in non-production for local tools
    }

    if (!allowedOrigins.has(candidate)) {
        throw new Response(JSON.stringify({ error: 'CSRF check failed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
