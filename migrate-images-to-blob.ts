import { Pool } from 'pg';
import { put } from '@vercel/blob';

async function migrateImagesToBlob() {
    console.log('🚀 Starting image migration to Blob storage...');

    // Direct PostgreSQL connection - parse connection string manually
    const pool = new Pool({
        user: 'polybet_user',
        host: '188.137.178.118',
        database: 'polybet',
        password: 'Baltim0r',
        port: 5432,
        ssl: false,
        max: 5,
        connectionTimeoutMillis: 10000,
    });

    let client;
    try {
        client = await pool.connect();
        console.log('✅ Connected to database');

        // Fetch all events with imageUrl
        const result = await client.query(
            'SELECT id, title, "imageUrl" FROM "Event" WHERE "imageUrl" IS NOT NULL'
        );
        const events = result.rows;

        console.log(`📊 Found ${events.length} events with images`);

        let migrated = 0;
        let skipped = 0;
        let failed = 0;

        for (const event of events) {
            if (!event.imageUrl) continue;

            // Skip if already on Blob
            if (event.imageUrl.includes('vercel-storage.com') || event.imageUrl.includes('public.blob.vercel-storage.com')) {
                console.log(`⏭️  Skipping ${event.title} (already on Blob)`);
                skipped++;
                continue;
            }

            try {
                console.log(`📥 Downloading: ${event.title}`);

                // Download the image
                const response = await fetch(event.imageUrl);
                if (!response.ok) {
                    throw new Error(`Failed to download: ${response.statusText}`);
                }

                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Generate filename from event ID and original extension
                const ext = event.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
                const filename = `events/${event.id}.${ext}`;

                console.log(`☁️  Uploading to Blob: ${filename}`);

                // Upload to Blob
                const blobResult = await put(filename, buffer, {
                    access: 'public',
                    contentType: blob.type || 'image/jpeg',
                });

                // Update database
                await client.query(
                    'UPDATE "Event" SET "imageUrl" = $1 WHERE id = $2',
                    [blobResult.url, event.id]
                );

                console.log(`✅ Migrated: ${event.title} -> ${blobResult.url}`);
                migrated++;

                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`❌ Failed to migrate ${event.title}:`, error);
                failed++;
            }
        }

        console.log('\n📈 Migration Summary:');
        console.log(`   ✅ Migrated: ${migrated}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log('✨ Migration complete!');
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

migrateImagesToBlob().catch(console.error);
