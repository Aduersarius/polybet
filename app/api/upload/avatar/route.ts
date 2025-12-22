import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { validateFile, getFileExtension } from '@/lib/file-validation';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        console.log('Avatar upload started');

        const user = await requireAuth(request);
        const userId = user.id;
        console.log('User authenticated:', userId);

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return createClientErrorResponse('No file provided', 400);
        }

        // Comprehensive file validation (magic bytes, type, size, extension)
        const validation = await validateFile(file, 5 * 1024 * 1024); // 5MB max
        if (!validation.valid) {
            return createClientErrorResponse(validation.error || 'File validation failed', 400);
        }

        // Check if BLOB token is available
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return createClientErrorResponse('Server configuration error', 500);
        }

        // Use sanitized filename
        const extension = getFileExtension(validation.sanitizedFilename || file.name);
        const blobKey = `avatars/${userId}-${Date.now()}.${extension}`;

        // Upload to Vercel Blob
        const blob = await put(blobKey, file, {
            access: 'public',
        });

        return NextResponse.json({ url: blob.url });
    } catch (error) {
        return createErrorResponse(error);
    }
}
