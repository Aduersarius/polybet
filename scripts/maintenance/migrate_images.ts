
import 'dotenv/config';
import { prisma } from '../../lib/prisma';
import { put } from '@vercel/blob';

async function main() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('❌ BLOB_READ_WRITE_TOKEN is missing in .env');
        process.exit(1);
    }

    console.log('📦 Starting image migration to Vercel Blob...');

    // Find events with Unsplash images
    const events = await prisma.event.findMany({
        where: {
            imageUrl: {
                contains: 'unsplash.com'
            }
        }
    });

    console.log(`Found ${events.length} events with Unsplash images.`);

    let successCount = 0;
    let failCount = 0;

    for (const event of events) {
        if (!event.imageUrl) continue;

        console.log(`\nProcessing "${event.title}" (${event.id})...`);
        console.log(`   Source: ${event.imageUrl}`);

        try {
            // 1. Download image
            const response = await fetch(event.imageUrl);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const blob = await response.blob();

            // 2. Upload to Vercel Blob
            // Generate a clean filename
            const filename = `events/${event.id}-${Date.now()}.jpg`;

            const { url } = await put(filename, blob, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN
            });

            console.log(`   ✓ Uploaded to Blob: ${url}`);

            // 3. Update Database
            await prisma.event.update({
                where: { id: event.id },
                data: { imageUrl: url }
            });

            console.log(`   ✓ Database updated`);
            successCount++;

        } catch (error) {
            console.error(`   ✗ Failed:`, error);
            failCount++;
        }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
