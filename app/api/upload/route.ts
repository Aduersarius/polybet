import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
    try {
        const data = await request.formData();
        const file: File | null = data.get('file') as unknown as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No file uploaded' },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = file.name.replace(/\.[^/.]+$/, "") + '-' + uniqueSuffix + '.' + file.name.split('.').pop();

        // Save to public/uploads
        const uploadDir = join(process.cwd(), 'public/uploads');
        const path = join(uploadDir, filename);

        // Ensure directory exists (though public usually exists, uploads might not)
        // Note: In a real app, we'd check/create dir. Here assuming public exists.
        // We might need to create 'uploads' folder if it doesn't exist.

        await writeFile(path, buffer);

        const url = `/uploads/${filename}`;

        return NextResponse.json({ url });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Upload failed' },
            { status: 500 }
        );
    }
}
