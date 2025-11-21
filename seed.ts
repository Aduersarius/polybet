import { prisma } from './lib/prisma';

async function main() {
    console.log('🌱 Seeding database...');

    // Create a placeholder user for event creation
    const user = await prisma.user.upsert({
        where: { address: '0x0000000000000000000000000000000000000000' },
        update: {},
        create: {
            address: '0x0000000000000000000000000000000000000000',
            username: 'System',
        },
    });

    console.log('✅ Created system user:', user.id);

    // Generate 50 diverse events
    const categories = ['CRYPTO', 'SPORTS', 'POLITICS', 'CULTURE', 'FINANCE', 'TECH', 'WORLD', 'ECONOMY', 'ELECTIONS', 'SCIENCE'];
    const eventTemplates = [
        // Crypto events
        { title: 'Will BTC break $100k before 2025?', description: 'Bitcoin has been on a bull run throughout 2024. Will it reach the psychological $100,000 milestone before the new year?', category: 'CRYPTO', months: 1 },
        { title: 'Will ETH flip BTC by Q2 2025?', description: 'Can Ethereum overtake Bitcoin in market capitalization by the second quarter of 2025?', category: 'CRYPTO', months: 6 },
        { title: 'Solana to reach $500 this year?', description: 'Will Solana reach $500 USD per token before year end?', category: 'CRYPTO', months: 8 },
        { title: 'Dogecoin to $1 in 2025?', description: 'Will Dogecoin finally reach the coveted $1 price point?', category: 'CRYPTO', months: 12 },
        { title: 'Will Cardano launch smart contracts v2?', description: 'Will Cardano successfully deploy their smart contracts v2 upgrade?', category: 'CRYPTO', months: 4 },
        { title: 'Bitcoin halving impact positive?', description: 'Will Bitcoin price increase after the next halving event?', category: 'CRYPTO', months: 10 },
        { title: 'New altcoin season incoming?', description: 'Will we see a new altcoin season with 50%+ gains across the board?', category: 'CRYPTO', months: 5 },

        // Sports events
        { title: 'Lakers to win NBA Championship?', description: 'Will the Los Angeles Lakers secure the NBA championship this season?', category: 'SPORTS', months: 7 },
        { title: 'Ronaldo to score 30+ goals?', description: 'Will Cristiano Ronaldo score 30 or more goals across all competitions in the 2024/25 season?', category: 'SPORTS', months: 6 },
        { title: 'Warriors back to playoffs?', description: 'Will the Golden State Warriors make it to the NBA playoffs?', category: 'SPORTS', months: 5 },
        { title: 'Messi wins another Ballon d\'Or?', description: 'Will Lionel Messi win his 9th Ballon d\'Or award?', category: 'SPORTS', months: 10 },
        { title: 'NFL: Chiefs repeat Super Bowl?', description: 'Will the Kansas City Chiefs win back-to-back Super Bowl championships?', category: 'SPORTS', months: 3 },

        // Politics events
        { title: 'US Government shutdown in 2025?', description: 'Will there be a federal government shutdown in 2025 due to budget disagreements?', category: 'POLITICS', months: 12 },
        { title: 'UK to rejoin EU by 2030?', description: 'Will the United Kingdom rejoin the European Union before 2030?', category: 'POLITICS', months: 60 },
        { title: 'New climate accord signed?', description: 'Will a major new international climate agreement be signed?', category: 'POLITICS', months: 8 },
        { title: 'AI regulation bill passes?', description: 'Will comprehensive AI regulation be passed in the US Congress?', category: 'POLITICS', months: 10 },
        { title: 'Student debt forgiveness?', description: 'Will any student debt forgiveness program be implemented?', category: 'POLITICS', months: 9 },

        // Culture events (renamed from Entertainment)
        { title: 'Will GTA 6 release in 2025?', description: 'Rockstar Games has been teasing GTA 6 for years. Will it actually release this year?', category: 'CULTURE', months: 12 },
        { title: 'Taylor Swift tour highest-grossing?', description: 'Will Taylor Swift\'s Eras Tour become the highest-grossing concert tour of all time?', category: 'CULTURE', months: 4 },
        { title: 'Marvel announces X-Men reboot?', description: 'Will Marvel Studios officially announce an X-Men MCU reboot?', category: 'CULTURE', months: 6 },
        { title: 'Stranger Things final season?', description: 'Will the final season of Stranger Things be released this year?', category: 'CULTURE', months: 8 },
        { title: 'New Star Wars trilogy announced?', description: 'Will Disney announce a new Star Wars film trilogy?', category: 'CULTURE', months: 5 },

        // Finance events
        { title: 'Stock market correction >20%?', description: 'Will the S&P 500 experience a correction of more than 20% this year?', category: 'FINANCE', months: 8 },
        { title: 'Gold above $3000/oz?', description: 'Will gold prices exceed $3000 per ounce?', category: 'FINANCE', months: 10 },
        { title: 'Tesla maintains $1T valuation?', description: 'Will Tesla keep its market cap above $1 trillion?', category: 'FINANCE', months: 6 },
        { title: 'JPMorgan acquires regional bank?', description: 'Will JPMorgan Chase acquire another regional bank?', category: 'FINANCE', months: 12 },
        { title: 'Oil prices above $120/barrel?', description: 'Will crude oil prices rise above $120 per barrel?', category: 'FINANCE', months: 9 },

        // Tech events
        { title: 'Apple Vision Pro 2 announced?', description: 'Will Apple announce the second generation of Vision Pro?', category: 'TECH', months: 14 },
        { title: 'OpenAI releases GPT-5?', description: 'Will OpenAI release GPT-5 this year?', category: 'TECH', months: 10 },
        { title: 'Meta launches AI assistant?', description: 'Will Meta release a competitive AI assistant platform?', category: 'TECH', months: 7 },
        { title: 'Tesla Full Self-Driving approved?', description: 'Will Tesla receive regulatory approval for Full Self-Driving in the US?', category: 'TECH', months: 15 },
        { title: 'Quantum computing breakthrough?', description: 'Will a major quantum computing milestone be achieved?', category: 'TECH', months: 18 },

        // World events
        { title: 'Ukraine-Russia peace agreement?', description: 'Will a peace agreement be reached between Ukraine and Russia?', category: 'WORLD', months: 12 },
        { title: 'New BRICS member joins?', description: 'Will another country officially join the BRICS alliance?', category: 'WORLD', months: 8 },
        { title: 'Major earthquake hits Tokyo?', description: 'Will Tokyo experience a major earthquake (7.0+)?', category: 'WORLD', months: 24 },
        { title: 'Antarctic ice shelf collapse?', description: 'Will a major Antarctic ice shelf collapse this year?', category: 'WORLD', months: 11 },
        { title: 'Middle East peace talks resume?', description: 'Will formal peace negotiations resume in the Middle East?', category: 'WORLD', months: 9 },

        // Economy events
        { title: 'Fed cuts rates 3+ times?', description: 'Will the Federal Reserve cut interest rates three or more times this year?', category: 'ECONOMY', months: 11 },
        { title: 'Recession declared in US?', description: 'Will the US officially enter a recession (2 consecutive quarters of negative GDP)?', category: 'ECONOMY', months: 8 },
        { title: 'Housing prices drop 15%?', description: 'Will US median home prices decline by 15% or more?', category: 'ECONOMY', months: 12 },
        { title: 'Unemployment above 5%?', description: 'Will US unemployment rate exceed 5%?', category: 'ECONOMY', months: 10 },
        { title: 'Inflation below 2%?', description: 'Will US inflation fall below the Fed\'s 2% target?', category: 'ECONOMY', months: 9 },

        // Elections events
        { title: '2024 US Presidential Election?', description: 'Who will win the 2024 US Presidential Election?', category: 'ELECTIONS', months: 1 },
        { title: 'UK General Election in 2025?', description: 'Will the UK hold a general election in 2025?', category: 'ELECTIONS', months: 6 },
        { title: 'German coalition government?', description: 'Will Germany form a new coalition government?', category: 'ELECTIONS', months: 8 },
        { title: 'India election turnout >70%?', description: 'Will India\'s election see voter turnout above 70%?', category: 'ELECTIONS', months: 12 },
        { title: 'France far-right gains seats?', description: 'Will far-right parties gain significant seats in French parliament?', category: 'ELECTIONS', months: 10 },

        // Science events
        { title: 'JWST discovers habitable planet?', description: 'Will the James Webb Space Telescope discover a potentially habitable exoplanet?', category: 'SCIENCE', months: 16 },
        { title: 'mRNA cancer vaccine approved?', description: 'Will an mRNA-based cancer vaccine receive regulatory approval?', category: 'SCIENCE', months: 20 },
        { title: 'Nuclear fusion net energy gain?', description: 'Will a nuclear fusion reactor achieve sustained net energy gain?', category: 'SCIENCE', months: 14 },
        { title: 'Artemis Moon landing success?', description: 'Will NASA\'s Artemis program successfully land humans on the Moon?', category: 'SCIENCE', months: 24 },
        { title: 'Alzheimer\'s cure breakthrough?', description: 'Will a major breakthrough in Alzheimer\'s treatment be announced?', category: 'SCIENCE', months: 18 },
    ];

    // Update event templates to use categories array
    const eventTemplatesWithCategories = eventTemplates.map(template => {
        // Assign multiple categories based on event content
        let categories = [template.category];

        // Add additional relevant categories
        if (template.category === 'CRYPTO') {
            if (template.title.includes('Bitcoin') || template.title.includes('ETH') || template.title.includes('Solana') || template.title.includes('Dogecoin')) {
                categories.push('FINANCE');
            }
            if (template.title.includes('regulation') || template.title.includes('SEC')) {
                categories.push('POLITICS');
            }
        }
        if (template.category === 'FINANCE') {
            if (template.title.includes('Tesla') || template.title.includes('oil')) {
                categories.push('ECONOMY');
            }
        }
        if (template.category === 'TECH') {
            if (template.title.includes('OpenAI') || template.title.includes('AI') || template.title.includes('Meta')) {
                categories.push('SCIENCE');
            }
        }
        if (template.category === 'ELECTIONS') {
            categories.push('POLITICS');
        }
        if (template.category === 'ECONOMY') {
            categories.push('FINANCE');
        }

        return { ...template, categories };
    });

    // Create events
    for (let i = 0; i < 50; i++) {
        const template = eventTemplatesWithCategories[i];
        const resolutionDate = new Date();
        resolutionDate.setMonth(resolutionDate.getMonth() + template.months);

        const event = await prisma.event.create({
            data: {
                title: template.title,
                description: template.description,
                categories: template.categories,
                resolutionDate,
                creatorId: user.id,
                status: 'ACTIVE',
            },
        });
        console.log(`✅ Created event ${i + 1}/50:`, event.title);
    }

    console.log('🎉 Seeding completed! Created 50 events.');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
