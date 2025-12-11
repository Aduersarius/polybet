export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Completely static response - no database calls
    return Response.json({
        success: true,
        message: 'Vercel function works!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'unknown',
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) + '...'
    });
}