import { getPayload } from 'payload';
import config from '../payload.config';
import { prisma } from '../lib/prisma';

async function migrateEvents() {
    try {
        console.log('Starting migration of Events to Payload...');

        // Initialize Payload
        const payload = await getPayload({ config });

        // Fetch all events from Prisma
        const prismaEvents = await prisma.event.findMany();
        console.log(`Found ${prismaEvents.length} events in Prisma.`);

        for (const event of prismaEvents) {
            console.log(`Migrating event: ${event.title} (${event.id})`);

            // Check if already exists in Payload (by prismaId)
            const existing = await payload.find({
                collection: 'payload-events',
                where: {
                    prismaId: {
                        equals: event.id,
                    },
                },
            });

            if (existing.docs.length > 0) {
                console.log(`- Event already exists in Payload (ID: ${existing.docs[0].id}), skipping.`);
                continue;
            }

            // Map Prisma data to Payload schema
            const payloadData = {
                title: event.title,
                description: event.description,
                resolutionDate: event.resolutionDate.toISOString(),
                status: event.status as 'ACTIVE' | 'RESOLVED' | 'CANCELLED',
                result: event.result as 'YES' | 'NO' | null,
                isHidden: event.isHidden,
                rules: event.rules,
                categories: event.categories.map(c => {
                    // Map category strings to match Payload options if needed
                    // Assuming direct mapping for now as options match
                    return c;
                }),
                // Map AMM params
                amm: {
                    liquidityParameter: event.liquidityParameter,
                    initialLiquidity: event.initialLiquidity,
                },
                // Store the link to Prisma
                prismaId: event.id,
                // Handle Image: We can't easily migrate the file itself if it's external, 
                // but if it's a URL string in Prisma, we might need to upload it to Payload Media first
                // For now, we'll skip image migration or handle it if it's a URL string
            };

            // Create in Payload
            // IMPORTANT: Pass disableSync: true to prevent the hook from creating a DUPLICATE in Prisma
            const newPayloadEvent = await payload.create({
                collection: 'payload-events',
                data: payloadData,
                context: {
                    disableSync: true,
                },
            });

            console.log(`+ Created in Payload: ${newPayloadEvent.id}`);
        }

        console.log('Migration completed successfully.');
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateEvents();
