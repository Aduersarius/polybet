
import { prisma } from './lib/prisma';

async function main() {
    console.log('Searching for message "q" by "CryptoKing"...');

    const user = await prisma.user.findFirst({
        where: { username: 'CryptoKing' }
    });

    if (!user) {
        console.log('User CryptoKing not found');
        return;
    }

    const message = await prisma.message.findFirst({
        where: {
            userId: user.id,
            text: 'q'
        }
    });

    if (!message) {
        console.log('Message not found');
        return;
    }

    const event = await prisma.event.findUnique({
        where: { id: message.eventId }
    });

    if (!event) {
        console.log('Event not found');
        return;
    }

    console.log(`Found message in event: ${message.eventId}`);
    console.log(`Event Title: ${event.title}`);
    console.log(`Event Rules: ${event.rules}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
