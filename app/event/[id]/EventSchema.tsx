import { getEventImageUrl, getEventCanonicalUrl, getBaseUrl } from '@/lib/seo';

interface EventSchemaProps {
    event: {
        id: string;
        title: string;
        description?: string | null;
        imageUrl?: string | null;
        categories?: string[] | null;
        createdAt?: string | Date | null;
        resolutionDate?: string | Date | null;
        status?: string | null;
        slug?: string | null;
    };
}

/**
 * JSON-LD structured data component for Event schema
 * Following Google's guidelines: https://developers.google.com/search/docs/appearance/structured-data/event
 */
export function EventSchema({ event }: EventSchemaProps) {
    const baseUrl = getBaseUrl();
    const eventUrl = getEventCanonicalUrl(event);
    const imageUrl = getEventImageUrl(event);
    
    // Determine event type based on categories
    const isSportsEvent = event.categories?.some(cat => 
        ['SPORTS', 'ESPORTS'].includes(cat)
    );
    
    const eventType = isSportsEvent ? 'SportsEvent' : 'Event';
    
    // Format dates
    const startDate = event.createdAt 
        ? new Date(event.createdAt).toISOString()
        : new Date().toISOString();
    
    const endDate = event.resolutionDate
        ? new Date(event.resolutionDate).toISOString()
        : undefined;
    
    // Determine event status - must be a schema.org URL
    let eventStatus = 'https://schema.org/EventScheduled';
    if (event.status === 'RESOLVED') {
        eventStatus = 'https://schema.org/EventCancelled';
    } else if (event.status === 'CANCELLED') {
        eventStatus = 'https://schema.org/EventCancelled';
    }

    // Determine event attendance mode - online prediction market
    const eventAttendanceMode = 'https://schema.org/OnlineEventAttendanceMode';

    const schema = {
        '@context': 'https://schema.org',
        '@type': eventType,
        name: event.title,
        description: event.description || event.title,
        image: imageUrl,
        url: eventUrl,
        startDate: startDate,
        ...(endDate && { endDate: endDate }),
        eventStatus: eventStatus,
        eventAttendanceMode: eventAttendanceMode,
        organizer: {
            '@type': 'Organization',
            name: 'Pariflow',
            url: baseUrl,
        },
        // VirtualLocation for online events - only url is required
        location: {
            '@type': 'VirtualLocation',
            url: eventUrl,
        },
        // Optional: Add performer as Pariflow platform
        performer: {
            '@type': 'Organization',
            name: 'Pariflow',
            url: baseUrl,
        },
        // Optional: Add offers schema for prediction market participation
        offers: {
            '@type': 'Offer',
            url: eventUrl,
            price: '0',
            priceCurrency: 'USD',
            availability: event.status === 'RESOLVED' 
                ? 'https://schema.org/SoldOut' 
                : 'https://schema.org/InStock',
            validFrom: startDate,
        },
        ...(event.categories && event.categories.length > 0 && {
            about: event.categories.map(cat => ({
                '@type': 'Thing',
                name: cat,
            })),
        }),
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
    );
}
