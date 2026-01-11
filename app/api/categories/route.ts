import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { prisma } = await import('@/lib/prisma');

        const { getOrSet } = await import('@/lib/cache');

        // Cache category list for 24 hours (86400s) as it changes infrequently
        const result = await getOrSet(
            'categories:list',
            async () => {
                // Get all active events and their categories
                const events = await prisma.event.findMany({
                    where: { status: 'ACTIVE' },
                    select: { categories: true }
                });

                // Extract unique categories from the arrays
                const categorySet = new Set<string>();
                events.forEach((event: (typeof events)[number]) => {
                    event.categories.forEach((category: string) => {
                        categorySet.add(category);
                    });
                });

                // Convert to sorted array
                const dbCategories = Array.from(categorySet).sort();

                // Special categories that should be at the beginning
                const specialCategories = ['ALL', 'TRENDING', 'NEW', 'FAVORITES'];

                // Combine special categories with database categories (remove duplicates)
                const allCategories = [...specialCategories, ...dbCategories.filter(cat => !specialCategories.includes(cat))];

                return { categories: allCategories };
            },
            { ttl: 86400, prefix: 'static' }
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to fetch categories:', error);
        return NextResponse.json(
            { error: 'Failed to fetch categories' },
            { status: 500 }
        );
    }
}