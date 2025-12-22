import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { recordTelemetryEvent } from '@/lib/user-telemetry';

const ALLOWED_TYPES = new Set(['perf', 'error', 'feature', 'security']);

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);

        const limit = await rateLimit(`telemetry:${user.id}`, 60, 60);
        if (!limit.allowed) {
            return NextResponse.json({ error: 'Too many events' }, { status: 429 });
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
        }

        const { type, name, payload } = body as { type?: string; name?: string; payload?: unknown };

        if (!type || !ALLOWED_TYPES.has(type)) {
            return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
        }

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json({ error: 'Missing event name' }, { status: 400 });
        }

        const trimmedName = name.trim().slice(0, 120);
        const safePayload = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;

        await recordTelemetryEvent({
            userId: user.id,
            request,
            type,
            name: trimmedName,
            payload: safePayload,
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        // requireAuth throws a Response object when authentication fails
        if (error instanceof Response) {
            return error;
        }
        console.error('[telemetry] handler error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
