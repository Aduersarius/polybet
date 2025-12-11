
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export async function PATCH(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        const body = await request.json();
        const { name, image } = body;

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                name,
                image,
                // Also update username if name is updated, to keep them in sync or separate?
                // The schema has both username and name. Better Auth uses 'name'.
                // Let's update username too if it's empty or we want to sync them.
                // For now, just update 'name' which is what Better Auth uses.
                username: name || undefined
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Error updating profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
