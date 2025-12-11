import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        // Enforce a 5MB limit before buffering
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'File size must be under 5MB' }, { status: 400 });
        }

        // Basic client hint plus server-side magic-byte validation
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const header = new Uint8Array(arrayBuffer.slice(0, 12));
        const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
        const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38;
        const isWebp =
            header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
            header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;

        if (!isPng && !isJpeg && !isGif && !isWebp) {
            return NextResponse.json({ error: 'Unsupported image type (allowed: png, jpeg, gif, webp)' }, { status: 400 });
        }

        const extension = isPng ? 'png' : isJpeg ? 'jpg' : isGif ? 'gif' : 'webp';

        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            console.error('Upload error: missing BLOB_READ_WRITE_TOKEN');
            return NextResponse.json({ error: 'Server is not configured for uploads' }, { status: 500 });
        }

        const blobKey = `uploads/${user.id}-${Date.now()}-${randomUUID()}.${extension}`;
        const safeBlob = new Blob([arrayBuffer], { type: file.type || `image/${extension}` });
        const blob = await put(blobKey, safeBlob, {
            access: 'public',
        });

        return NextResponse.json({ url: blob.url });
    } catch (error) {
        console.error('Upload error:', error);
        const message = error instanceof Error ? error.message : 'Upload failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
