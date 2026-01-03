import { prisma } from '../../lib/prisma';

async function findActiveEvent() {
    const event = await prisma.event.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true, type: true }
    });

    if (event) {
        console.log(JSON.stringify(event));
    } else {
        console.log('null');
    }
}

findActiveEvent()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
