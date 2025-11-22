import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const paramsData = await params;
        const address = paramsData.address.toLowerCase();

        if (!address) {
            return NextResponse.json(
                { error: 'Address is required' },
                { status: 400 }
            );
        }

        let user = await prisma.user.findUnique({
            where: { address },
            include: {
                bets: true,
                createdEvents: true,
            },
        });

        if (!user) {
            // Create user if they don't exist (auto-provisioning)
            user = await prisma.user.create({
                data: {
                    address,
                    username: `User ${address.slice(0, 6)}`,
                },
                include: {
                    bets: true,
                    createdEvents: true,
                },
            });
        }

        // Calculate stats
        const totalBets = user.bets.length;
        const totalVolume = user.bets.reduce((acc, bet) => acc + bet.amount, 0);
        // Win rate calculation would go here if we had bet outcomes
        const winRate = 0; // Placeholder

        return NextResponse.json({
            ...user,
            stats: {
                totalBets,
                totalVolume,
                winRate,
            },
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const paramsData = await params;
        const address = paramsData.address.toLowerCase();
        const body = await request.json();
        const { username, description, avatarUrl, twitter, discord, telegram, website } = body;

        console.log('Updating user:', { address, username, description, avatarUrl, twitter, discord, telegram, website });

        const updatedUser = await prisma.user.upsert({
            where: { address },
            update: {
                username,
                description,
                avatarUrl,
                twitter,
                discord,
                telegram,
                website,
            },
            create: {
                address,
                username,
                description,
                avatarUrl,
                twitter,
                discord,
                telegram,
                website,
            },
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
            { error: 'Failed to update user' },
            { status: 500 }
        );
    }
}
