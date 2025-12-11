import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const body = await request.json();
        const {
            title,
            description,
            categories = [],
            resolutionDate,
            imageUrl,
            type = 'BINARY',
            outcomes,
        } = body;

        if (!title || !description || !resolutionDate) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!['BINARY', 'MULTIPLE'].includes(type)) {
            return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
        }

        const parsedDate = new Date(resolutionDate);
        if (Number.isNaN(parsedDate.getTime())) {
            return NextResponse.json({ error: 'Invalid resolution date' }, { status: 400 });
        }

        const suggestion = await prisma.eventSuggestion.create({
            data: {
                userId: user.id,
                title,
                description,
                categories,
                resolutionDate: parsedDate,
                imageUrl,
                type,
                outcomes,
                status: 'PENDING',
            },
        });

        return NextResponse.json({ suggestion });
    } catch (error: any) {
        console.error('Error creating event suggestion:', error);
        const status = error?.status || 500;
        const message = error?.message || 'Failed to submit suggestion';
        return NextResponse.json({ error: message }, { status });
    }
}



