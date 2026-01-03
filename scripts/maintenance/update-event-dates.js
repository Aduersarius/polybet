const { prisma } = require('../../lib/prisma');

async function updateEventDates() {
    console.log('Updating event creation dates...');

    try {
        const events = await prisma.event.findMany();
        console.log(`Found ${events.length} events`);

        const now = new Date();
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        for (const event of events) {
            // Random creation time between 3 months ago and 1 month ago
            const randomCreatedAt = new Date(
                threeMonthsAgo.getTime() + Math.random() * (oneMonthAgo.getTime() - threeMonthsAgo.getTime())
            );

            await prisma.event.update({
                where: { id: event.id },
                data: { createdAt: randomCreatedAt },
            });

            console.log(`✅ Updated ${event.title} to ${randomCreatedAt.toISOString()}`);
        }

        console.log('🎉 All event dates updated!');

    } catch (error) {
        console.error('Error updating event dates:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateEventDates();
