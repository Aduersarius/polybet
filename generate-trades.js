const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateTrades() {
    console.log('Generating trades for all events...');

    try {
        // Get all events
        const events = await prisma.event.findMany();
        console.log(`Found ${events.length} events`);

        const user = await prisma.user.findFirst();
        if (!user) {
            console.log('No user found, creating default user...');
            await prisma.user.create({
                data: {
                    address: '0x0000000000000000000000000000000000000000',
                    username: 'PolyBet Admin',
                }
            });
        }

        const defaultUser = await prisma.user.findFirst();

        for (const event of events) {
            // Generate 2000-5000 random trades
            const tradeCount = Math.floor(Math.random() * 3000) + 2000;
            const yesRatio = Math.random(); // Random market sentiment

            console.log(`Generating ${tradeCount} trades for ${event.title}...`);

            // Create trades in batches
            const batchSize = 100;
            for (let i = 0; i < tradeCount; i += batchSize) {
                const batchTrades = [];
                const endIndex = Math.min(i + batchSize, tradeCount);

                for (let j = i; j < endIndex; j++) {
                    const amount = Math.random() * 990 + 10; // $10-$1000
                    const option = Math.random() < yesRatio ? 'YES' : 'NO';

                    batchTrades.push({
                        amount,
                        option,
                        userId: defaultUser.id,
                        eventId: event.id,
                    });
                }

                await prisma.bet.createMany({
                    data: batchTrades,
                });
            }

            console.log(`✅ Created ${tradeCount} trades for ${event.title}`);
        }

        console.log('🎉 All trades generated successfully!');

    } catch (error) {
        console.error('Error generating trades:', error);
    } finally {
        await prisma.$disconnect();
    }
}

generateTrades();