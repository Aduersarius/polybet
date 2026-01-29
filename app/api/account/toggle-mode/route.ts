import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DEMO_INITIAL_BALANCE = 10000;

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth(req);
        const body = await req.json();
        const { mode } = body;

        if (!mode || !['DEMO', 'LIVE'].includes(mode)) {
            return NextResponse.json({ error: 'Invalid mode. Must be DEMO or LIVE' }, { status: 400 });
        }

        // Switch user's account mode
        await prisma.user.update({
            where: { id: user.id },
            data: { accountMode: mode }
        });

        // If switching to DEMO for the first time, initialize DEMO balance
        if (mode === 'DEMO') {
            const existingDemoBalance = await prisma.balance.findFirst({
                where: {
                    userId: user.id,
                    tokenSymbol: 'TUSD',
                    eventId: null,
                    accountType: 'DEMO'
                }
            });

            if (!existingDemoBalance) {
                // Create initial DEMO balance
                await prisma.balance.create({
                    data: {
                        userId: user.id,
                        tokenSymbol: 'TUSD',
                        eventId: null,
                        outcomeId: null,
                        amount: DEMO_INITIAL_BALANCE,
                        accountType: 'DEMO'
                    }
                });
            }
        }

        return NextResponse.json({
            success: true,
            mode,
            message: `Switched to ${mode} mode`
        });

    } catch (error: any) {
        console.error('Error toggling account mode:', error);
        return NextResponse.json({ error: error.message || 'Failed to toggle mode' }, { status: 500 });
    }
}
