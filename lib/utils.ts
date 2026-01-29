import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Sanitizes a URL to prevent XSS (e.g. javascript: protocols)
 */
export function sanitizeUrl(url: string | null | undefined): string {
    if (!url) return '#';
    const trimmed = url.trim();
    if (
        trimmed.startsWith('https://') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('mailto:') ||
        trimmed.startsWith('tel:') ||
        trimmed.startsWith('data:image/')
    ) {
        return trimmed;
    }
    return '#';
}

/**
 * Safely stringifies an object for inclusion in a <script type="application/ld+json"> tag.
 * Prevents XSS by escaping the literal sequence "</script>".
 */
export function safeJsonLd(schema: any): string {
    return JSON.stringify(schema).replace(/</g, '\\u003c');
}
