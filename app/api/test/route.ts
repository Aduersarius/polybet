export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
    try {
        const { prisma } = await import('@/lib/prisma');

        // Simple connection test
        const start = Date.now();
        const count = await prisma.event.count();
        const duration = Date.now() - start;

        return Response.json({
            success: true,
            eventCount: count,
            queryTime: `${duration}ms`,
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (error) {
        return Response.json({
            success: false,
            error: String(error),
            timestamp: new Date().toISOString(),
            database: 'failed'
        }, { status: 500 });
    }
}