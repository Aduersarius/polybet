import { prisma } from './lib/prisma';

async function main() {
    const event = await prisma.event.findFirst();
    if (event) {
        console.log('First Event ID:', event.id);
        console.log('First Event Title:', event.title);
    } else {
        console.log('No events found');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
