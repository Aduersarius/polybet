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
    
    // Determine event status
    let eventStatus = 'EventScheduled';
    if (event.status === 'RESOLVED') {
        eventStatus = 'EventPostponed'; // Or EventCancelled if cancelled
    }

    const schema = {
        '@context': 'https://schema.org',
        '@type': eventType,
        name: event.title,
        description: event.description || event.title,
        image: imageUrl,
        url: eventUrl,
        startDate: startDate,
        ...(endDate && { endDate: endDate }),
        eventStatus: {
            '@type': 'EventStatusType',
            name: eventStatus,
        },
        organizer: {
            '@type': 'Organization',
            name: 'Pariflow',
            url: baseUrl,
        },
        location: {
            '@type': 'VirtualLocation',
            name: 'Pariflow Prediction Market',
            url: baseUrl,
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
