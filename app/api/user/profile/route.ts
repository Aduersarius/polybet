import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse } from '@/lib/error-handler';
import { invalidatePattern } from '@/lib/cache';

export async function PATCH(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        const body = await request.json();
        const { name, image } = body;

        const dataToUpdate: any = {
            name,
            username: name || undefined
        };

        if (image) {
            dataToUpdate.image = image;
            dataToUpdate.avatarUrl = image;
        }

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: dataToUpdate
        });

        // Invalidate caches to ensure the new avatar/name is reflected immediately
        try {
            console.log(`[Profile] Invalidating caches for user ${user.id}`);
            // Invalidate message caches for all events (since user might have messages in any event)
            await invalidatePattern('*:messages:*');
            // Invalidate public profile stats/avatar cache
            await invalidatePattern(`user-stats:user:stats:${user.id}`);
            // Invalidate any other user-specific caches if they exist
            await invalidatePattern(`user:${user.id}:*`);
        } catch (cacheError) {
            console.error('[Profile] Cache invalidation failed:', cacheError);
            // Don't fail the request if cache invalidation fails
        }

        return NextResponse.json(updatedUser);
    } catch (error) {
        return createErrorResponse(error);
    }
}
