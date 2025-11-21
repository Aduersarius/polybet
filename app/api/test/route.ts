export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
    try {
        const { prisma } = await import('@/lib/prisma');

        // Ultra-simple test - just check if we can connect
        const start = Date.now();
        await prisma.event.findFirst({ select: { id: true } });
        const duration = Date.now() - start;

        return Response.json({
            success: true,
            queryTime: `${duration}ms`,
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (error) {
        return Response.json({
            success: false,
            error: String(error).substring(0, 100), // Truncate for safety
            timestamp: new Date().toISOString(),
            database: 'failed'
        }, { status: 500 });
    }
}