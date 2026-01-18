import { NextResponse } from 'next/server';

export async function GET() {
    // Test that Doppler secrets are loaded
    const secrets = {
        database_url: process.env.DATABASE_URL ? '✅ Loaded' : '❌ Missing',
        polymarket_key: process.env.POLYMARKET_PRIVATE_KEY ? '✅ Loaded' : '❌ Missing',
        better_auth: process.env.BETTER_AUTH_SECRET ? '✅ Loaded' : '❌ Missing',
        redis_url: process.env.REDIS_URL ? '✅ Loaded' : '❌ Missing',
    };

    return NextResponse.json({
        success: true,
        message: 'Doppler integration test',
        secrets,
        source: process.env.DOPPLER_CONFIG ? 'Doppler' : '.env file',
        config: process.env.DOPPLER_CONFIG || 'none',
        environment: process.env.DOPPLER_ENVIRONMENT || 'none',
    });
}
