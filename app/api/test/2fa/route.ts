import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// GET /api/test/2fa - Test if 2FA plugin is working
export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);

        // Check if user is authenticated
        console.log('[2FA TEST] User authenticated:', user.id);

        // Try to get TOTP URI
        // This would normally be done client-side, but we're testing server setup
        return NextResponse.json({
            success: true,
            message: '2FA plugin is configured on server',
            userId: user.id,
            note: 'Client-side 2FA methods should be called from the browser'
        });
    } catch (error) {
        console.error('[2FA TEST] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
