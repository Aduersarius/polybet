import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { validateFile, getFileExtension } from '@/lib/file-validation';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return createClientErrorResponse('File is required', 400);
        }

        // Comprehensive file validation (magic bytes, type, size, extension)
        const validation = await validateFile(file, 5 * 1024 * 1024); // 5MB max
        if (!validation.valid) {
            return createClientErrorResponse(validation.error || 'File validation failed', 400);
        }

        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return createClientErrorResponse('Server is not configured for uploads', 500);
        }

        // Use sanitized filename
        const extension = getFileExtension(validation.sanitizedFilename || file.name);
        const blobKey = `uploads/${user.id}-${Date.now()}-${randomUUID()}.${extension}`;
        
        const blob = await put(blobKey, file, {
            access: 'public',
        });

        return NextResponse.json({ url: blob.url });
    } catch (error) {
        return createErrorResponse(error);
    }
}
