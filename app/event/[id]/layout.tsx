import type { Metadata } from 'next';
import { getEventImageUrl, getEventCanonicalUrl, formatEventTitle, formatEventDescription, getBaseUrl } from '@/lib/seo';
import { EventSchema } from './EventSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fetch event data for metadata generation
 * Uses direct database access for better performance in server components
 */
async function fetchEventForMetadata(id: string) {
    try {
        const { prisma } = await import('@/lib/prisma');
        const isPolymarketId = /^\d+$/.test(id);

        const commonSelect = {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            slug: true,
            categories: true,
            createdAt: true,
            resolutionDate: true,
            status: true,
        };

        let event: any = null;

        if (isPolymarketId) {
            // Try by Polymarket ID first
            event = await prisma.event.findUnique({
                where: { polymarketId: id },
                select: commonSelect,
            });

            // Fallback to direct ID lookup
            if (!event) {
                event = await prisma.event.findUnique({
                    where: { id },
                    select: commonSelect,
                });
            }
        } else {
            // Try direct ID lookup first
            event = await prisma.event.findUnique({
                where: { id },
                select: commonSelect,
            });

            // Fallback to slug lookup
            if (!event) {
                event = await prisma.event.findUnique({
                    where: { slug: id },
                    select: commonSelect,
                });
            }
        }

        return event;
    } catch (error) {
        console.error('Error fetching event for metadata:', error);
        return null;
    }
}

/**
 * Generate metadata for event pages
 */
export async function generateMetadata({ 
    params 
}: { 
    params: Promise<{ id: string }> 
}): Promise<Metadata> {
    const { id } = await params;
    const event = await fetchEventForMetadata(id);

    // Fallback metadata if event not found
    if (!event) {
        return {
            title: 'Event | Pariflow',
            description: 'View this prediction market event on Pariflow.',
        };
    }

    const baseUrl = getBaseUrl();
    const eventUrl = getEventCanonicalUrl(event);
    const imageUrl = getEventImageUrl(event);
    const title = formatEventTitle(event.title);
    const description = formatEventDescription(event.title, event.resolutionDate);

    return {
        title,
        description,
        alternates: {
            canonical: eventUrl,
        },
        openGraph: {
            type: 'website',
            title: title, // Use formatted title for OG
            description,
            url: eventUrl,
            siteName: 'Pariflow',
            locale: 'en_US',
            images: [
                {
                    url: imageUrl,
                    width: 1200,
                    height: 630,
                    alt: event.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: title, // Use formatted title for Twitter
            description,
            images: [imageUrl],
            // site: '@pariflow', // Uncomment if you have Twitter handle
        },
        keywords: event.categories?.join(', ') || undefined,
    };
}

/**
 * Event Layout - Wraps event page with metadata and schema markup
 */
export default async function EventLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const event = await fetchEventForMetadata(id);

    return (
        <>
            {event && <EventSchema event={event} />}
            {children}
        </>
    );
}
