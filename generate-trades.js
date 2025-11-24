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

            const now = new Date();
            const eventCreatedAt = new Date(event.createdAt);
            const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

            // Create trades in batches
            const batchSize = 100;
            for (let i = 0; i < tradeCount; i += batchSize) {
                const batchTrades = [];
                const endIndex = Math.min(i + batchSize, tradeCount);

                for (let j = i; j < endIndex; j++) {
                    const amount = Math.random() * 990 + 10; // $10-$1000
                    const option = Math.random() < yesRatio ? 'YES' : 'NO';

                    // 70% historical bets, 30% recent bets (last 6 hours)
                    let createdAt;
                    if (Math.random() < 0.7) {
                        // Historical bet: between event creation and 6 hours ago
                        const historicalEnd = Math.max(sixHoursAgo.getTime(), eventCreatedAt.getTime());
                        createdAt = new Date(
                            eventCreatedAt.getTime() + Math.random() * (historicalEnd - eventCreatedAt.getTime())
                        );
                    } else {
                        // Recent bet: within last 6 hours
                        createdAt = new Date(
                            sixHoursAgo.getTime() + Math.random() * (now.getTime() - sixHoursAgo.getTime())
                        );
                    }

                    batchTrades.push({
                        amount,
                        option,
                        userId: defaultUser.id,
                        eventId: event.id,
                        createdAt,
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