import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse } from '@/lib/error-handler';

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
                username: name || undefined
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        return createErrorResponse(error);
    }
}
