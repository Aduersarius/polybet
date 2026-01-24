import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { getBaseUrl } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

/**
 * Generate dynamic sitemap that includes all active events
 * Automatically updates when events are created or deleted
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = getBaseUrl();
    const now = new Date();

    // Static pages with high priority
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/leaderboard`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/faq`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/legal/terms`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/legal/privacy-policy`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.5,
        },
    ];

    try {
        // Fetch all active events (not resolved, not deleted)
        const events = await prisma.event.findMany({
            where: {
                status: {
                    in: ['ACTIVE', 'PENDING'], // Only include active/pending events
                },
                // Exclude events that are too far in the past (older than 1 year)
                createdAt: {
                    gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
                },
            },
            select: {
                id: true,
                slug: true,
                updatedAt: true,
                resolutionDate: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            // Limit to prevent sitemap from being too large (50,000 URL limit per sitemap)
            take: 10000,
        });

        // Generate event URLs (prefer slugs for better SEO)
        const eventPages: MetadataRoute.Sitemap = events.map((event: any) => {
            const url = `${baseUrl}/event/${event.slug || event.id}`;

            // Determine priority based on how recent the event is
            const daysSinceCreation = Math.floor(
                (now.getTime() - new Date(event.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            );

            // Newer events get higher priority
            let priority = 0.7;
            if (daysSinceCreation < 7) priority = 0.9;
            else if (daysSinceCreation < 30) priority = 0.8;
            else if (daysSinceCreation < 90) priority = 0.7;
            else priority = 0.6;

            // Determine change frequency based on resolution date
            let changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' = 'daily';
            if (event.resolutionDate) {
                const daysUntilResolution = Math.floor(
                    (new Date(event.resolutionDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (daysUntilResolution < 1) changeFrequency = 'hourly';
                else if (daysUntilResolution < 7) changeFrequency = 'daily';
                else changeFrequency = 'weekly';
            }

            return {
                url,
                lastModified: event.updatedAt || event.createdAt,
                changeFrequency,
                priority,
            };
        });

        return [...staticPages, ...eventPages];
    } catch (error) {
        console.error('Error generating sitemap:', error);
        // Return at least static pages if event fetch fails
        return staticPages;
    }
}
