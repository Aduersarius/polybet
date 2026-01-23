import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        if (!user.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const status = searchParams.get('status');
        const search = searchParams.get('search') || '';
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status && ['PENDING', 'APPROVED', 'DECLINED'].includes(status)) {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { categories: { has: search } },
            ];
        }

        const [suggestions, total] = await Promise.all([
            prisma.eventSuggestion.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    user: {
                        select: { id: true, username: true, email: true, address: true }
                    },
                    approvedEvent: {
                        select: { slug: true }
                    }
                }
            }),
            prisma.eventSuggestion.count({ where }),
        ]);

        return NextResponse.json({ suggestions, total });
    } catch (error) {
        console.error('Error fetching event suggestions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        if (!user.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { suggestionId, action, note } = body;

        if (!suggestionId || !['approve', 'decline'].includes(action)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        if (action === 'decline') {
            const updated = await prisma.eventSuggestion.update({
                where: { id: suggestionId },
                data: {
                    status: 'DECLINED',
                    reviewedBy: user.id,
                    reviewedAt: new Date(),
                    reviewNote: note,
                },
            });
            return NextResponse.json({ suggestion: updated });
        }

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const suggestion = await tx.eventSuggestion.findUnique({ where: { id: suggestionId } });
            if (!suggestion) {
                throw new Error('Suggestion not found');
            }

            const outcomes = Array.isArray(suggestion.outcomes) ? suggestion.outcomes : [];
            const isMultiple = suggestion.type === 'MULTIPLE';
            const { generateSlugWithLLM } = await import('@/lib/slug');
            const slug = await generateSlugWithLLM(suggestion.title, suggestion.resolutionDate);

            const event = await tx.event.create({
                data: {
                    title: suggestion.title,
                    slug: slug || null,
                    description: suggestion.description,
                    categories: suggestion.categories,
                    resolutionDate: suggestion.resolutionDate,
                    imageUrl: suggestion.imageUrl,
                    type: suggestion.type || 'BINARY',
                    creatorId: suggestion.userId,
                    status: 'ACTIVE',
                    isHidden: false,
                    liquidityParameter: isMultiple ? 10000.0 : undefined,
                    outcomes: isMultiple && outcomes.length > 0
                        ? {
                            create: outcomes
                                .filter((o: any) => o?.name)
                                .map((o: any) => ({
                                    name: o.name,
                                    probability: o.probability ?? 0.5,
                                    liquidity: o.liquidity ?? 0,
                                })),
                        }
                        : undefined,
                },
            });

            const updated = await tx.eventSuggestion.update({
                where: { id: suggestionId },
                data: {
                    status: 'APPROVED',
                    reviewedBy: user.id,
                    reviewedAt: new Date(),
                    reviewNote: note,
                    approvedEventId: event.id,
                },
            });

            return { event, suggestion: updated };
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error handling suggestion:', error);
        const message = error?.message || 'Failed to process suggestion';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}





