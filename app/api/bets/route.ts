export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { eventId, option, amount, userId } = body;

        if (!eventId || !option || !amount || !userId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Ensure user exists
        let user = await prisma.user.findUnique({ where: { address: userId } });
        if (!user) {
            user = await prisma.user.create({ data: { address: userId } });
        }

        // Create bet
        const bet = await prisma.bet.create({
            data: {
                amount: parseFloat(amount),
                option,
                userId: user.id,
                eventId,
            },
        });

        return NextResponse.json(bet);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to place bet' }, { status: 500 });
    }
}
