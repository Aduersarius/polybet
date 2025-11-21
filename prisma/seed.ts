async function main() {
    // Import prisma from lib for proper adapter configuration
    const { prisma } = await import('../lib/prisma');

    // Create a default user
    const user = await prisma.user.upsert({
        where: { address: '0x0000000000000000000000000000000000000000' },
        update: {},
        create: {
            address: '0x0000000000000000000000000000000000000000',
            username: 'PolyBet Admin',
        },
    });

    // Create diverse events with images
    const events = [
        // CRYPTO
        {
            id: 'btc-100k-2025',
            title: 'Will Bitcoin break $100k before 2025?',
            description: 'Bitcoin has been on a bullish run. Will it finally reach the six-figure milestone before the end of 2024?',
            categories: ['CRYPTO', 'FINANCE'],
            imageUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=800&q=80',
            resolutionDate: new Date('2024-12-31'),
            creatorId: user.id,
        },
        {
            id: 'eth-flip-btc',
            title: 'Will ETH flip BTC in market cap by 2025?',
            description: 'The flippening has been predicted for years. Will Ethereum finally surpass Bitcoin in total market capitalization?',
            categories: ['CRYPTO'],
            imageUrl: 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
        {
            id: 'solana-500-2025',
            title: 'Will Solana reach $500 in 2025?',
            description: 'SOL has shown incredible resilience and growth. Can it reach the $500 price point in the next year?',
            categories: ['CRYPTO'],
            imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },

        // SPORTS
        {
            id: 'argentina-copa',
            title: 'Will Argentina defend their Copa America title?',
            description: 'Can Messi lead Argentina to back-to-back Copa America victories?',
            categories: ['SPORTS'],
            imageUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
            resolutionDate: new Date('2025-07-14'),
            creatorId: user.id,
        },
        {
            id: 'lakers-nba-2025',
            title: 'Lakers to win NBA Championship 2025?',
            description: 'Will LeBron and AD bring another championship ring to LA this season?',
            categories: ['SPORTS'],
            imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
            resolutionDate: new Date('2025-06-30'),
            creatorId: user.id,
        },
        {
            id: 'ronaldo-goals',
            title: 'Ronaldo to score 40+ goals this season?',
            description: 'CR7 continues to defy age. Can he score 40+ goals in all competitions this season?',
            categories: ['SPORTS'],
            imageUrl: 'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&q=80',
            resolutionDate: new Date('2025-05-31'),
            creatorId: user.id,
        },

        // POLITICS
        {
            id: 'us-shutdown-2025',
            title: 'Will there be a US government shutdown in 2025?',
            description: 'Political gridlock has led to shutdowns before. Will we see another one in 2025?',
            categories: ['POLITICS'],
            imageUrl: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
        {
            id: 'uk-eu-rejoin',
            title: 'UK to hold Brexit reversal referendum by 2027?',
            description: 'Brexit sentiment has shifted. Will the UK hold a referendum on rejoining the EU?',
            categories: ['POLITICS', 'WORLD'],
            imageUrl: 'https://images.unsplash.com/photo-1467664631004-58beab1ece0d?w=800&q=80',
            resolutionDate: new Date('2027-01-01'),
            creatorId: user.id,
        },

        // TECH
        {
            id: 'gta6-release-2025',
            title: 'Will GTA 6 release in 2025?',
            description: 'Rockstar has been teasing GTA 6 for years. Will we finally see it released in 2025?',
            categories: ['TECH', 'CULTURE'],
            imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
        {
            id: 'openai-gpt5',
            title: 'Will OpenAI release GPT-5 in 2025?',
            description: 'AI advancement continues at breakneck speed. Will GPT-5 arrive in 2025?',
            categories: ['TECH', 'SCIENCE'],
            imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },

        // SCIENCE
        {
            id: 'fusion-net-energy',
            title: 'Nuclear fusion net energy gain breakthrough?',
            description: 'Will a nuclear fusion reactor achieve sustained net energy gain by 2027?',
            categories: ['SCIENCE'],
            imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80',
            resolutionDate: new Date('2027-01-21'),
            creatorId: user.id,
        },
        {
            id: 'mars-sample-return',
            title: 'Mars sample return mission success by 2030?',
            description: 'Will NASA successfully return Mars samples to Earth by 2030?',
            categories: ['SCIENCE'],
            imageUrl: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=800&q=80',
            resolutionDate: new Date('2030-12-31'),
            creatorId: user.id,
        },

        // CULTURE
        {
            id: 'taylor-tour-revenue',
            title: 'Taylor Swift Eras Tour to gross $2B+?',
            description: 'The Eras Tour is already breaking records. Will it become the first tour to gross over $2 billion?',
            categories: ['CULTURE'],
            imageUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800&q=80',
            resolutionDate: new Date('2025-03-31'),
            creatorId: user.id,
        },
        {
            id: 'dune-part-3',
            title: 'Dune Part 3 announcement in 2025?',
            description: 'After the success of Dune: Part Two, will Denis Villeneuve announce Part 3 in 2025?',
            categories: ['CULTURE'],
            imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },

        // FINANCE
        {
            id: 'sp500-6000',
            title: 'S&P 500 to hit 6,000 in 2025?',
            description: 'The stock market continues its upward trajectory. Will the S&P 500 reach 6,000 points?',
            categories: ['FINANCE'],
            imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
        {
            id: 'apple-3t-market-cap',
            title: 'Apple to hit $4T market cap in 2025?',
            description: 'Apple became the first $3T company. Can it reach $4 trillion in 2025?',
            categories: ['FINANCE', 'TECH'],
            imageUrl: 'https://images.unsplash.com/photo-1611532736579-6b16e2b50449?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },

        // ELECTIONS
        {
            id: 'us-general-2024',
            title: 'Democratic Party win 2024 US Presidential Election?',
            description: 'Will the Democratic candidate win the 2024 US Presidential Election?',
            categories: ['ELECTIONS', 'POLITICS'],
            imageUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80',
            resolutionDate: new Date('2024-11-06'),
            creatorId: user.id,
        },

        // ECONOMY
        {
            id: 'recession-2025',
            title: 'Global recession in 2025?',
            description: 'Economic indicators are mixed. Will the global economy enter a recession in 2025?',
            categories: ['ECONOMY'],
            imageUrl: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&q=80',
            resolutionDate: new Date('2025-12-31'),
            creatorId: user.id,
        },
    ];

    console.log('Creating events...');
    for (const event of events) {
        await prisma.event.upsert({
            where: { id: event.id },
            update: event,
            create: event,
        });
    }

    console.log('Creating mock bets...');
    // Create varied bets for each event
    for (const event of events) {
        const betCount = Math.floor(Math.random() * 300) + 50; // 50-350 bets
        const yesRatio = Math.random(); // Random ratio for YES/NO

        for (let i = 0; i < betCount; i++) {
            await prisma.bet.create({
                data: {
                    amount: Math.random() * 5000 + 50, // $50-$5050
                    option: Math.random() < yesRatio ? 'YES' : 'NO',
                    userId: user.id,
                    eventId: event.id,
                },
            });
        }
    }

    console.log('✅ Seed data created successfully!');
    console.log(`📊 Created ${events.length} events with varied bet data`);
}

main()
    .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    });
