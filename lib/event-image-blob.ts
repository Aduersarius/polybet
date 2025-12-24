/**
 * Event Image Storage - Vercel Blob Integration
 * 
 * Handles uploading event images to Vercel Blob storage
 * and cleaning up images when events are deleted.
 */

import { put, del, list } from '@vercel/blob';

const BLOB_FOLDER = 'events';

/**
 * Download an image from a URL and upload it to Vercel Blob
 * @param imageUrl - Source image URL to download
 * @param eventId - Event ID for unique filename
 * @returns The new Vercel Blob URL, or null if failed
 */
export async function uploadEventImageToBlob(
    imageUrl: string,
    eventId: string
): Promise<string | null> {
    if (!imageUrl) return null;

    // Skip if already a Vercel Blob URL
    if (imageUrl.includes('blob.vercel-storage.com')) {
        console.log(`[Blob] Image already in Blob storage: ${eventId}`);
        return imageUrl;
    }

    // Skip invalid URLs
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        console.log(`[Blob] Invalid image URL for ${eventId}: ${imageUrl}`);
        return null;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.warn('[Blob] BLOB_READ_WRITE_TOKEN not set, skipping image upload');
        return null;
    }

    try {
        console.log(`[Blob] Downloading image for event ${eventId}...`);

        // Download the image
        const response = await fetch(imageUrl, {
            signal: AbortSignal.timeout(15000), // 15s timeout
            headers: {
                'User-Agent': 'PolyBet/1.0',
                'Accept': 'image/*',
            },
        });

        if (!response.ok) {
            console.error(`[Blob] Failed to fetch image: ${response.status} ${response.statusText}`);
            return null;
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const blob = await response.blob();

        // Determine file extension from content type
        let extension = 'jpg';
        if (contentType.includes('png')) extension = 'png';
        else if (contentType.includes('gif')) extension = 'gif';
        else if (contentType.includes('webp')) extension = 'webp';
        else if (contentType.includes('svg')) extension = 'svg';

        // Generate unique filename
        const filename = `${BLOB_FOLDER}/${eventId}-${Date.now()}.${extension}`;

        console.log(`[Blob] Uploading to: ${filename}`);

        // Upload to Vercel Blob
        const { url } = await put(filename, blob, {
            access: 'public',
            token,
            contentType,
        });

        console.log(`[Blob] ✓ Uploaded event image: ${url}`);
        return url;
    } catch (error) {
        console.error(`[Blob] Failed to upload image for event ${eventId}:`, error);
        return null;
    }
}

/**
 * Delete an event's image from Vercel Blob storage
 * @param imageUrl - The Vercel Blob URL to delete
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteEventImageFromBlob(imageUrl: string | null): Promise<boolean> {
    if (!imageUrl) return false;

    // Only delete if it's a Vercel Blob URL
    if (!imageUrl.includes('blob.vercel-storage.com')) {
        console.log(`[Blob] Skipping non-Blob image deletion: ${imageUrl}`);
        return false;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.warn('[Blob] BLOB_READ_WRITE_TOKEN not set, skipping image deletion');
        return false;
    }

    try {
        console.log(`[Blob] Deleting image: ${imageUrl}`);
        await del(imageUrl, { token });
        console.log(`[Blob] ✓ Deleted image successfully`);
        return true;
    } catch (error) {
        console.error(`[Blob] Failed to delete image:`, error);
        return false;
    }
}

/**
 * Delete multiple event images from Vercel Blob storage
 * @param imageUrls - Array of Vercel Blob URLs to delete
 * @returns Number of successfully deleted images
 */
export async function deleteEventImagesFromBlob(imageUrls: (string | null)[]): Promise<number> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.warn('[Blob] BLOB_READ_WRITE_TOKEN not set, skipping image deletion');
        return 0;
    }

    const blobUrls = imageUrls.filter(
        (url): url is string =>
            typeof url === 'string' && url.includes('blob.vercel-storage.com')
    );

    if (blobUrls.length === 0) {
        console.log('[Blob] No Blob images to delete');
        return 0;
    }

    try {
        console.log(`[Blob] Deleting ${blobUrls.length} images...`);
        await del(blobUrls, { token });
        console.log(`[Blob] ✓ Deleted ${blobUrls.length} images successfully`);
        return blobUrls.length;
    } catch (error) {
        console.error(`[Blob] Failed to delete images:`, error);
        return 0;
    }
}

/**
 * List all event images in Vercel Blob storage
 * @returns Array of blob objects with url and pathname
 */
export async function listEventImages(): Promise<Array<{ url: string; pathname: string }>> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.warn('[Blob] BLOB_READ_WRITE_TOKEN not set');
        return [];
    }

    try {
        const { blobs } = await list({ prefix: BLOB_FOLDER, token });
        return blobs.map(b => ({ url: b.url, pathname: b.pathname }));
    } catch (error) {
        console.error('[Blob] Failed to list images:', error);
        return [];
    }
}
