export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const { prisma } = await import('@/lib/prisma');
        const body = await request.json();
        const { eventId, option, amount, userId } = body;

        if (!eventId || !option || !amount || !userId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Ensure user exists with timeout
        const userQuery = prisma.user.findUnique({ where: { address: userId } });
        const userTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('User query timeout')), 5000);
        });

        let user = await Promise.race([userQuery, userTimeout]) as any;

        if (!user) {
            const createUserQuery = prisma.user.create({ data: { address: userId } });
            const createTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('User creation timeout')), 5000);
            });
            user = await Promise.race([createUserQuery, createTimeout]);
        }

        // Create bet with timeout
        const betQuery = prisma.bet.create({
            data: {
                amount: parseFloat(amount),
                option,
                userId: user.id,
                eventId,
            },
        });

        const betTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Bet creation timeout')), 5000);
        });

        const bet = await Promise.race([betQuery, betTimeout]) as any;

        const totalTime = Date.now() - startTime;
        console.log(`✅ Bet placed in ${totalTime}ms`);

        // Log bet placement to Braintrust
        try {
            const { logBetPlacement } = await import('@/lib/braintrust');
            await logBetPlacement({
                eventId,
                option,
                amount: parseFloat(amount),
                userId,
                betId: bet.id,
            }, {
                processingTime: totalTime,
                success: true,
            });
        } catch (logError) {
            console.warn('Braintrust logging failed:', logError);
        }

        return NextResponse.json(bet);
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`❌ Bet placement failed after ${errorTime}ms:`, error);

        if (error instanceof Error && error.message.includes('timeout')) {
            return NextResponse.json({
                error: 'Database timeout',
                message: 'Bet placement took too long'
            }, { status: 504 });
        }

        return NextResponse.json({ error: 'Failed to place bet' }, { status: 500 });
    }
}
