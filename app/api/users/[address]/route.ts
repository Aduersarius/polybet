import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

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
                    createdEvents: true,
                },
            });
        }

        // Calculate stats
        const totalBets = 0; // Placeholder - bets not included
        const totalVolume = 0; // Placeholder - bets not included
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
        assertSameOrigin(request);
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

        // Import validation functions
        const {
            validateUsername,
            validateDescription,
            validateSafeUrl,
            validateSocialHandle
        } = await import('@/lib/validation');

        // Validate username
        const usernameResult = validateUsername(body.username);
        if (!usernameResult.valid) {
            return NextResponse.json({ error: `username: ${usernameResult.error}` }, { status: 400 });
        }

        // Validate description (sanitized)
        const descriptionResult = validateDescription(body.description);
        if (!descriptionResult.valid) {
            return NextResponse.json({ error: `description: ${descriptionResult.error}` }, { status: 400 });
        }

        // Validate avatar URL (must be http/https)
        const avatarResult = validateSafeUrl(body.avatarUrl);
        if (!avatarResult.valid) {
            return NextResponse.json({ error: `avatarUrl: ${avatarResult.error}` }, { status: 400 });
        }

        // Validate website URL (CRITICAL: prevents javascript: XSS)
        const websiteResult = validateSafeUrl(body.website);
        if (!websiteResult.valid) {
            return NextResponse.json({ error: `website: ${websiteResult.error}` }, { status: 400 });
        }

        // Validate social handles
        const twitterResult = validateSocialHandle(body.twitter, { platform: 'twitter' });
        if (!twitterResult.valid) {
            return NextResponse.json({ error: `twitter: ${twitterResult.error}` }, { status: 400 });
        }

        const discordResult = validateSocialHandle(body.discord, { platform: 'discord' });
        if (!discordResult.valid) {
            return NextResponse.json({ error: `discord: ${discordResult.error}` }, { status: 400 });
        }

        const telegramResult = validateSocialHandle(body.telegram, { platform: 'telegram' });
        if (!telegramResult.valid) {
            return NextResponse.json({ error: `telegram: ${telegramResult.error}` }, { status: 400 });
        }

        console.log('Updating user (validated):', {
            address,
            username: usernameResult.sanitized,
            hasDescription: !!descriptionResult.sanitized,
            hasAvatar: !!avatarResult.sanitized,
            hasWebsite: !!websiteResult.sanitized,
        });

        const updatedUser = await prisma.user.upsert({
            where: { address },
            update: {
                username: usernameResult.sanitized || undefined,
                description: descriptionResult.sanitized || undefined,
                avatarUrl: avatarResult.sanitized || undefined,
                twitter: twitterResult.sanitized || undefined,
                discord: discordResult.sanitized || undefined,
                telegram: telegramResult.sanitized || undefined,
                website: websiteResult.sanitized || undefined,
            },
            create: {
                address,
                email: `${address}@placeholder.com`, // Required for BetterAuth
                username: usernameResult.sanitized || undefined,
                description: descriptionResult.sanitized || undefined,
                avatarUrl: avatarResult.sanitized || undefined,
                twitter: twitterResult.sanitized || undefined,
                discord: discordResult.sanitized || undefined,
                telegram: telegramResult.sanitized || undefined,
                website: websiteResult.sanitized || undefined,
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

