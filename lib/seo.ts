/**
 * SEO utility functions for generating metadata and structured data
 */

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 */
export function truncate(text: string | null | undefined, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Get the base URL for absolute URLs
 * Server-safe: works in both server and client components
 */
export function getBaseUrl(): string {
    // Server-side: use environment variables
    if (typeof window === 'undefined') {
        return process.env.NEXT_PUBLIC_APP_URL 
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://pariflow.com');
    }
    // Client-side: use window location
    return window.location.origin;
}

/**
 * Convert a relative or absolute image URL to an absolute URL
 */
export function getAbsoluteImageUrl(imageUrl: string | null | undefined, fallback?: string): string {
    const baseUrl = getBaseUrl();
    
    if (!imageUrl) {
        return fallback ? `${baseUrl}${fallback}` : `${baseUrl}/events/crypto.png`;
    }
    
    // If already absolute URL, return as-is
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    
    // If relative URL, make it absolute
    if (imageUrl.startsWith('/')) {
        return `${baseUrl}${imageUrl}`;
    }
    
    // Otherwise, assume it's a relative path and add base URL
    return `${baseUrl}/${imageUrl}`;
}

/**
 * Get category image path (relative)
 */
export function getCategoryImagePath(categories: string[] | null | undefined): string {
    if (!categories || categories.length === 0) return '/events/crypto.png';

    const categoryMap: { [key: string]: string } = {
        'BUSINESS': '/events/crypto.png',
        'CRYPTO': '/events/crypto.png',
        'CULTURE': '/events/entertainment.png',
        'ECONOMY': '/events/crypto.png',
        'ELECTIONS': '/events/politics.png',
        'ESPORTS': '/events/entertainment.png',
        'FINANCE': '/events/crypto.png',
        'POLITICS': '/events/politics.png',
        'SCIENCE': '/events/crypto.png',
        'SPORTS': '/events/sports.png',
        'TECH': '/events/crypto.png',
        'WORLD': '/events/politics.png',
    };

    for (const category of categories) {
        if (categoryMap[category]) {
            return categoryMap[category];
        }
    }

    return '/events/crypto.png'; // Default fallback
}

/**
 * Generate event image URL (absolute) with fallback
 */
export function getEventImageUrl(event: {
    imageUrl?: string | null;
    categories?: string[] | null;
}): string {
    const baseUrl = getBaseUrl();
    
    if (event.imageUrl) {
        return getAbsoluteImageUrl(event.imageUrl);
    }
    
    const categoryImage = getCategoryImagePath(event.categories);
    return `${baseUrl}${categoryImage}`;
}

/**
 * Generate canonical URL for an event
 */
export function getEventCanonicalUrl(event: {
    id: string;
    slug?: string | null;
}): string {
    const baseUrl = getBaseUrl();
    // Prefer slug-based URLs for better SEO
    return `${baseUrl}/event/${event.slug || event.id}`;
}
