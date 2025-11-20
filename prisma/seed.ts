import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Create a default user
    const user = await prisma.user.upsert({
        where: { address: '0x0000000000000000000000000000000000000000' },
        update: {},
        create: {
            address: '0x0000000000000000000000000000000000000000',
            username: 'PolyBet Admin',
        },
    });

    // Create diverse events
    const events = [
        // CRYPTO
        {
            title: 'Will BTC break $100k before 2025?',
            description: 'Bitcoin reaching six-figure milestone',
            category: 'CRYPTO',
            resolutionDate: new Date('2025-01-01'),
            creatorId: user.id,
        },
        {
            title: 'Will ETH flip BTC in market cap by Q2 2025?',
            description: 'Ethereum surpassing Bitcoin in total market capitalization',
            category: 'CRYPTO',
            resolutionDate: new Date('2025-06-30'),
            creatorId: user.id,
        },
        {
            title: 'Will Solana reach $500 in 2025?',
            description: 'SOL token price prediction',
            category: 'CRYPTO',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },

        // SPORTS
        {
            title: 'Will Argentina win Copa America 2024?',
            description: 'Can Messi lead Argentina to another trophy?',
            category: 'SPORTS',
            resolutionDate: new Date('2024-07-14'),
            creatorId: user.id,
        },
        {
            title: 'Lakers to win NBA Championship 2025?',
            description: 'Will LeBron and AD bring another ring to LA?',
            category: 'SPORTS',
            resolutionDate: new Date('2025-06-30'),
            creatorId: user.id,
        },
        {
            title: 'Ronaldo to score 30+ goals this season?',
            description: 'CR7 goal-scoring prediction in Saudi League',
            category: 'SPORTS',
            resolutionDate: new Date('2025-05-31'),
            creatorId: user.id,
        },

        // POLITICS
        {
            title: 'Will there be a US government shutdown in 2025?',
            description: 'Prediction on government funding crisis',
            category: 'POLITICS',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
        {
            title: 'UK to rejoin EU by 2030?',
            description: 'Brexit reversal speculation',
            category: 'POLITICS',
            resolutionDate: new Date('2030-01-01'),
            creatorId: user.id,
        },

        // ENTERTAINMENT
        {
            title: 'Will GTA 6 release in 2025?',
            description: 'Rockstar\'s most anticipated game launch',
            category: 'ENTERTAINMENT',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
        {
            title: 'Succession to win Emmy for Best Drama?',
            description: '2024 Emmy Awards prediction',
            category: 'ENTERTAINMENT',
            resolutionDate: new Date('2024-09-15'),
            creatorId: user.id,
        },
        {
            title: 'Taylor Swift Eras Tour highest-grossing ever?',
            description: 'Will it break $2 billion in revenue?',
            category: 'ENTERTAINMENT',
            resolutionDate: new Date('2024-12-31'),
            creatorId: user.id,
        },
        {
            title: 'Dune 3 to be announced in 2025?',
            description: 'Continuation of the Dune saga',
            category: 'ENTERTAINMENT',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
    ];

    for (const event of events) {
        await prisma.event.upsert({
            where: { id: `seed-${event.title.substring(0, 10)}` },
            update: {},
            create: {
                id: `seed-${event.title.substring(0, 10)}`,
                ...event,
            },
        });
    }

    // Create some mock bets for volume
    const allEvents = await prisma.event.findMany();

    for (const event of allEvents.slice(0, 6)) {
        // Create random bets
        const betCount = Math.floor(Math.random() * 20) + 5;
        for (let i = 0; i < betCount; i++) {
            await prisma.bet.create({
                data: {
                    amount: Math.random() * 1000 + 100,
                    option: Math.random() > 0.5 ? 'YES' : 'NO',
                    userId: user.id,
                    eventId: event.id,
                },
            });
        }
    }

    console.log('✅ Seed data created successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
