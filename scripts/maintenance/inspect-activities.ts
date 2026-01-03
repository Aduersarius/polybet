
import 'dotenv/config';
import { prisma } from '../../lib/prisma';

async function main() {
    const event = await prisma.event.findFirst({
        where: { type: 'MULTIPLE', status: 'ACTIVE' },
        include: { outcomes: true }
    });

    if (!event) {
        console.log('No active MULTIPLE event found.');
        return;
    }

    console.log(`Event: ${event.title} (${event.id})`);
    console.log(`Created At: ${event.createdAt.toISOString()}`);
    console.log(`Liquidity Parameter (b): ${event.liquidityParameter}`);

    console.log('Outcomes:');
    (event as any).outcomes.forEach((o: any) => {
        console.log(`${o.name}: liquidity=${o.liquidity}, prob=${o.probability}`);
    });

    const activities = await prisma.marketActivity.findMany({
        take: 5
    });

    console.log(`Total Activities in DB (limit 5): ${activities.length}`);
    if (activities.length > 0) {
        console.log('Sample activity:', activities[0]);
    }

    const eventActivities = await prisma.marketActivity.count({
        where: { eventId: event.id }
    });
    console.log(`Activities for this event: ${eventActivities}`);
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
