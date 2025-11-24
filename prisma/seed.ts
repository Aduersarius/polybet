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
    const baseAMMParams = {
        liquidityParameter: 10000.0,
        qYes: 0.0,
        qNo: 0.0,
        initialLiquidity: 100.0,
    };

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
            ...baseAMMParams,
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
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (const event of events) {
        // Random creation time between 3 months ago and 1 month ago (so at least 1 month old)
        const randomCreatedAt = new Date(
            threeMonthsAgo.getTime() + Math.random() * (oneMonthAgo.getTime() - threeMonthsAgo.getTime())
        );

        await prisma.event.upsert({
            where: { id: event.id },
            update: { ...event, ...baseAMMParams, createdAt: randomCreatedAt },
            create: { ...event, ...baseAMMParams, createdAt: randomCreatedAt },
        });
    }

    console.log('Creating mock bets...');
    // Create 2000-5000 random bets for each event for realistic market data
    for (const event of events) {
        // Get the event with its actual creation time
        const eventRecord = await prisma.event.findUnique({ where: { id: event.id } });
        if (!eventRecord) continue;

        const eventCreatedAt = eventRecord.createdAt;
        const betCount = Math.floor(Math.random() * 3000) + 2000; // 2000-5000 bets per event
        const yesRatio = Math.random(); // Random ratio for YES/NO (creates market sentiment)

        console.log(`Creating ${betCount} bets for ${event.title}...`);

        let qYes = 0.0;
        let qNo = 0.0;
        const b = 10000.0; // Must match the liquidityParameter set earlier

        // Create bets in batches to avoid memory issues
        const batchSize = 500;
        for (let batch = 0; batch < betCount; batch += batchSize) {
            const batchEnd = Math.min(batch + batchSize, betCount);
            const batchPromises = [];

            for (let i = batch; i < batchEnd; i++) {
                const amount = Math.random() * 990 + 10; // $10-$1000
                const outcome = Math.random() < yesRatio ? 'YES' : 'NO';

                // Random bet time between event creation and now
                const betCreatedAt = new Date(
                    eventCreatedAt.getTime() + Math.random() * (now.getTime() - eventCreatedAt.getTime())
                );

                // Calculate AMM impact for this bet to track state
                // We need to approximate the tokens bought since we don't have the full AMM logic here easily available without importing it
                // But for the seed script, we can just use the simplified logic or import the helper if possible.
                // To avoid import issues with 'lib/amm', we'll implement a simplified token calculator here or just track the raw amounts?
                // NO, we must track qYes/qNo correctly for the odds to match.

                // Simplified AMM logic for seed (inverse of cost function is hard, so we'll approximate or just use a fixed price impact? No that's bad).
                // Let's just import the AMM logic or duplicate it.

                // Duplicate calculateTokensForCost logic here to be safe and self-contained
                const calcTokens = (currentQYes: number, currentQNo: number, cost: number, isYes: boolean) => {
                    let low = 0;
                    let high = cost * 10;
                    while (high - low > 0.001) {
                        const mid = (low + high) / 2;
                        const buyQYes = isYes ? mid : 0;
                        const buyQNo = !isYes ? mid : 0;
                        const currentCost = b * Math.log(Math.exp(currentQYes / b) + Math.exp(currentQNo / b));
                        const newCost = b * Math.log(Math.exp((currentQYes + buyQYes) / b) + Math.exp((currentQNo + buyQNo) / b));
                        const actualCost = newCost - currentCost;
                        if (actualCost < cost) low = mid;
                        else high = mid;
                    }
                    return (low + high) / 2;
                };

                const tokens = calcTokens(qYes, qNo, amount, outcome === 'YES');
                if (outcome === 'YES') qYes += tokens;
                else qNo += tokens;

                batchPromises.push(
                    prisma.bet.create({
                        data: {
                            amount,
                            option: outcome,
                            userId: user.id,
                            eventId: event.id,
                            createdAt: betCreatedAt,
                        },
                    })
                );
            }

            await Promise.all(batchPromises);
        }

        // Update Event with final AMM state
        // Calculate final odds
        const diff = (qNo - qYes) / b;
        const yesPrice = 1 / (1 + Math.exp(diff));
        const noPrice = 1 - yesPrice;

        await prisma.event.update({
            where: { id: event.id },
            data: {
                qYes,
                qNo,
                yesOdds: yesPrice, // Store as probability (0-1)
                noOdds: noPrice,   // Store as probability (0-1)
            }
        });
        console.log(`Updated ${event.title} state: qYes=${qYes.toFixed(2)}, qNo=${qNo.toFixed(2)}, Price=${yesPrice.toFixed(2)}`);
    }

    console.log('✅ Seed data created successfully!');
    console.log(`📊 Created ${events.length} events with varied bet data`);
}

main()
    .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    });
