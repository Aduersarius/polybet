import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { invalidatePattern } from '@/lib/cache';

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

        // Validate user update using centralized schema
        const { UserUpdateSchema } = await import('@/lib/validation');
        const parsed = UserUpdateSchema.safeParse(body);

        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            return NextResponse.json({ error: `${firstError.path.join('.')}: ${firstError.message}` }, { status: 400 });
        }

        const {
            username,
            description,
            avatarUrl,
            website,
            twitter,
            discord,
            telegram
        } = parsed.data;

        console.log('Updating user (validated):', {
            address,
            username,
            hasDescription: !!description,
            hasAvatar: !!avatarUrl,
            hasWebsite: !!website,
        });

        const updatedUser = await prisma.user.upsert({
            where: { address },
            update: {
                username: username || undefined,
                description: description || undefined,
                avatarUrl: avatarUrl || undefined,
                image: avatarUrl || undefined, // Sync image for BetterAuth compatibility
                twitter: twitter || undefined,
                discord: discord || undefined,
                telegram: telegram || undefined,
                website: website || undefined,
            },
            create: {
                address,
                email: `${address}@placeholder.com`, // Required for BetterAuth
                username: username || undefined,
                description: description || undefined,
                avatarUrl: avatarUrl || undefined,
                image: avatarUrl || undefined, // Sync image for BetterAuth compatibility
                twitter: twitter || undefined,
                discord: discord || undefined,
                telegram: telegram || undefined,
                website: website || undefined,
            },
        });

        // Invalidate caches to ensure the new avatar/name is reflected immediately
        try {
            console.log(`[Profile] Invalidating caches for user address ${address}`);
            // Invalidate message caches for all events
            await invalidatePattern('*:messages:*');
            // Invalidate public profile stats/avatar cache (using both key types found)
            await invalidatePattern(`user-stats:user:stats:${updatedUser.id}`);
            await invalidatePattern(`user:${updatedUser.id}:*`);
        } catch (cacheError) {
            console.error('[Profile] Cache invalidation failed:', cacheError);
        }

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
            { error: 'Failed to update user' },
            { status: 500 }
        );
    }
}

