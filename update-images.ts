import { prisma } from './lib/prisma';

async function main() {
    console.log('🖼️  Updating events with loremflickr images...');

    const events = await prisma.event.findMany({
        select: {
            id: true,
            title: true,
            category: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    for (let i = 0; i < events.length; i++) {
        const event = events[i];

        let keywords = 'technology';
        switch (event.category) {
            case 'CRYPTO':
                keywords = 'bitcoin,crypto,blockchain';
                break;
            case 'SPORTS':
                keywords = 'sports,athlete,stadium';
                break;
            case 'POLITICS':
                keywords = 'politics,news,government';
                break;
            case 'ENTERTAINMENT':
                keywords = 'cinema,movie,concert';
                break;
        }

        // Add random param to prevent caching identical images for same category
        const imageUrl = `https://loremflickr.com/800/600/${keywords}?random=${event.id}`;

        await prisma.event.update({
            where: { id: event.id },
            data: { imageUrl },
        });

        console.log(`✅ Updated "${event.title}" with ${event.category} image`);
    }

    console.log(`🎉 Updated ${events.length} events with unique photo placeholders!`);
}

main()
    .catch((e) => {
        console.error('❌ Update failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
