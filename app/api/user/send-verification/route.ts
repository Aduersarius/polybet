import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, auth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';

// POST /api/user/send-verification - Trigger better-auth to send verification email
export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);

        const key = `rl:send-verification:${user.id}`;
        const { allowed } = await rateLimit(key, 3, 900); // 3 emails per 15 minutes
        if (!allowed) {
            return NextResponse.json({ error: 'Too many verification requests' }, { status: 429 });
        }

        if (user.emailVerified) {
            return NextResponse.json({ error: 'Email already verified' }, { status: 400 });
        }

        // Use better-auth's internal API to send verification email
        // This will properly generate and store the token
        await auth.api.sendVerificationEmail({
            body: {
                email: user.email,
            },
        });

        console.log('[EMAIL] Verification email sent to:', user.email);

        return NextResponse.json({
            success: true,
            message: 'Verification email sent'
        });
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error('Error sending verification email:', error);
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
}
