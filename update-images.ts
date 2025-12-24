import { prisma } from './lib/prisma';

async function main() {
    console.log('🖼️  Updating events with loremflickr images...');

    const events = await prisma.event.findMany({
        select: {
            id: true,
            title: true,
            categories: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    for (let i = 0; i < events.length; i++) {
        const event = events[i];

        let keywords = 'technology';
        const category = event.categories[0] || 'TECH'; // Use first category or default
        switch (category) {
            case 'BUSINESS':
                keywords = 'business,office,corporate';
                break;
            case 'CRYPTO':
                keywords = 'bitcoin,crypto,blockchain';
                break;
            case 'CULTURE':
                keywords = 'cinema,movie,concert';
                break;
            case 'ECONOMY':
                keywords = 'economy,money,finance';
                break;
            case 'ELECTIONS':
                keywords = 'election,vote,democracy';
                break;
            case 'ESPORTS':
                keywords = 'gaming,esports,computer';
                break;
            case 'FINANCE':
                keywords = 'stock,market,trading';
                break;
            case 'POLITICS':
                keywords = 'politics,news,government';
                break;
            case 'SCIENCE':
                keywords = 'science,research,space';
                break;
            case 'SPORTS':
                keywords = 'sports,athlete,stadium';
                break;
            case 'TECH':
                keywords = 'technology,computer,software';
                break;
            case 'WORLD':
                keywords = 'world,globe,international';
                break;
        }

        // Add random param to prevent caching identical images for same category
        const imageUrl = `https://loremflickr.com/800/600/${keywords}?random=${event.id}`;

        await prisma.event.update({
            where: { id: event.id },
            data: { imageUrl },
        });

        console.log(`✅ Updated "${event.title}" with ${category} image`);
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
