import { prisma } from './lib/prisma';

// const prisma = new PrismaClient(); // Removed


async function main() {
    const count = await prisma.event.count();
    console.log(`Total events: ${count}`);
    const events = await prisma.event.findMany({ take: 5 });
    console.log('First 5 events:', JSON.stringify(events, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
