import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename || !request.body) {
        return NextResponse.json({ error: 'Filename and body are required' }, { status: 400 });
    }

    // ⚠️ Ensure you have BLOB_READ_WRITE_TOKEN in your .env
    const blob = await put(filename, request.body, {
        access: 'public',
    });

    return NextResponse.json(blob);
}
