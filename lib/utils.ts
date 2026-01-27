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
