import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

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
                    email: `${address}@placeholder.com`, // Required for BetterAuth
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
        // Authentication check
        const user = await requireAuth(request);

        const paramsData = await params;
        const address = paramsData.address.toLowerCase();

        // Ensure user can only update their own profile
        // Check if the authenticated user's address matches the requested address
        const authenticatedUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { address: true }
        });

        if (!authenticatedUser || authenticatedUser.address?.toLowerCase() !== address.toLowerCase()) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

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
                email: `${address}@placeholder.com`, // Required for BetterAuth
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
