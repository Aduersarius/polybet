
import { prisma } from './lib/prisma';

async function main() {
    console.log('Checking first event for rules...');
    const event = await prisma.event.findFirst();

    if (!event) {
        console.log('No events found.');
        return;
    }

    console.log(`Event ID: ${event.id}`);
    console.log(`Title: ${event.title}`);
    console.log(`Rules: ${event.rules}`);

    if (event.rules) {
        console.log('✅ Rules found in DB.');
    } else {
        console.log('❌ Rules NOT found in DB.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
