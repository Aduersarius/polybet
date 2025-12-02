import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        console.log('Avatar upload started');

        const user = await requireAuth(request);
        const userId = user.id;
        console.log('User authenticated:', userId);

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            console.error('No file provided in form data');
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        console.log('File received:', {
            name: file.name,
            type: file.type,
            size: file.size
        });

        // Validate file type
        if (!file.type.startsWith('image/')) {
            console.error('Invalid file type:', file.type);
            return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            console.error('File too large:', file.size);
            return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
        }

        // Check if BLOB token is available
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            console.error('BLOB_READ_WRITE_TOKEN not found in environment');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        console.log('Starting blob upload...');

        // Upload to Vercel Blob
        const blob = await put(`avatars/${userId}-${Date.now()}.${file.name.split('.').pop()}`, file, {
            access: 'public',
        });

        console.log('Blob uploaded successfully:', blob.url);

        return NextResponse.json({ url: blob.url });
    } catch (error: any) {
        console.error('Error uploading avatar:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        return NextResponse.json({
            error: 'Failed to upload avatar',
            details: error.message
        }, { status: 500 });
    }
}
