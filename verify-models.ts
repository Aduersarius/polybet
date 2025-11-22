
import { prisma } from './lib/prisma';

async function main() {
    console.log('Verifying Prisma models...');

    try {
        // Check if models exist on the client instance
        // @ts-ignore
        if (prisma.notification) {
            console.log('✅ Notification model exists');
        } else {
            console.error('❌ Notification model MISSING');
        }

        // @ts-ignore
        if (prisma.messageReaction) {
            console.log('✅ MessageReaction model exists');
        } else {
            console.error('❌ MessageReaction model MISSING');
        }

        // Try a simple count query
        // @ts-ignore
        const count = await prisma.notification.count();
        console.log(`Current notification count: ${count}`);

    } catch (error) {
        console.error('Error verifying models:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
