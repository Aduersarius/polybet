import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        // Create admin user
        const user = await prisma.user.upsert({
            where: { address: '0x0000000000000000000000000000000000000000' },
            update: {},
            create: {
                address: '0x0000000000000000000000000000000000000000',
                username: 'PolyBet Admin',
            },
        });

        // Create events
        const events = [
            // Science
            {
                id: 'event-science-1',
                title: 'Nuclear fusion net energy gain?',
                description: 'Will a nuclear fusion reactor achieve sustained net energy gain?',
                categories: ['SCIENCE'],
                resolutionDate: new Date('2027-01-21'),
                creatorId: user.id,
            },
            // Crypto
            {
                id: 'event-crypto-1',
                title: 'Will BTC break $100k before 2025?',
                description: 'Bitcoin reaching six-figure milestone',
                categories: ['CRYPTO'],
                resolutionDate: new Date('2025-01-01'),
                creatorId: user.id,
            },
            {
                id: 'event-crypto-2',
                title: 'Will ETH flip BTC in market cap by Q2 2025?',
                description: 'Ethereum surpassing Bitcoin in total market capitalization',
                categories: ['CRYPTO'],
                resolutionDate: new Date('2025-06-30'),
                creatorId: user.id,
            },
            {
                id: 'event-crypto-3',
                title: 'Will Solana reach $500 in 2025?',
                description: 'SOL token price prediction',
                categories: ['CRYPTO'],
                resolutionDate: new Date('2025-12-31'),
                creatorId: user.id,
            },
            // Sports
            {
                id: 'event-sports-1',
                title: 'Will Argentina win Copa America 2024?',
                description: 'Can Messi lead Argentina to another trophy?',
                categories: ['SPORTS'],
                resolutionDate: new Date('2024-07-14'),
                creatorId: user.id,
            },
            {
                id: 'event-sports-2',
                title: 'Lakers to win NBA Championship 2025?',
                description: 'Will LeBron and AD bring another ring to LA?',
                categories: ['SPORTS'],
                resolutionDate: new Date('2025-06-30'),
                creatorId: user.id,
            },
            {
                id: 'event-sports-3',
                title: 'Ronaldo to score 30+ goals this season?',
                description: 'CR7 goal-scoring prediction in Saudi League',
                categories: ['SPORTS'],
                resolutionDate: new Date('2025-05-31'),
                creatorId: user.id,
            },
            // Politics
            {
                id: 'event-politics-1',
                title: 'Will there be a US government shutdown in 2025?',
                description: 'Prediction on government funding crisis',
                categories: ['POLITICS'],
                resolutionDate: new Date('2025-12-31'),
                creatorId: user.id,
            },
            {
                id: 'event-politics-2',
                title: 'UK to rejoin EU by 2030?',
                description: 'Brexit reversal speculation',
                categories: ['POLITICS'],
                resolutionDate: new Date('2030-01-01'),
                creatorId: user.id,
            },
            // Entertainment
            {
                id: 'event-entertainment-1',
                title: 'Will GTA 6 release in 2025?',
                description: 'Rockstar most anticipated game launch',
                categories: ['ENTERTAINMENT'],
                resolutionDate: new Date('2025-12-31'),
                creatorId: user.id,
            },
            {
                id: 'event-entertainment-2',
                title: 'Succession to win Emmy for Best Drama?',
                description: '2024 Emmy Awards prediction',
                categories: ['ENTERTAINMENT'],
                resolutionDate: new Date('2024-09-15'),
                creatorId: user.id,
            },
            {
                id: 'event-entertainment-3',
                title: 'Taylor Swift Eras Tour highest-grossing ever?',
                description: 'Will it break $2 billion in revenue?',
                categories: ['ENTERTAINMENT'],
                resolutionDate: new Date('2024-12-31'),
                creatorId: user.id,
            },
        ];

        // Create events
        for (const event of events) {
            await prisma.event.upsert({
                where: { id: event.id },
                update: {},
                create: event,
            });
        }

        // Create sample bets
        const sampleBets = [
            { amount: 500.50, option: 'YES', eventId: 'event-crypto-1' },
            { amount: 250.75, option: 'NO', eventId: 'event-sports-1' },
            { amount: 1000.00, option: 'YES', eventId: 'event-science-1' },
            { amount: 300.25, option: 'NO', eventId: 'event-crypto-2' },
            { amount: 750.80, option: 'YES', eventId: 'event-entertainment-1' },
        ];

        for (const bet of sampleBets) {
            await prisma.bet.create({
                data: {
                    ...bet,
                    userId: user.id,
                },
            });
        }

        await prisma.$disconnect();

        return NextResponse.json({
            success: true,
            message: `Seeded ${events.length} events and ${sampleBets.length} bets successfully!`
        });

    } catch (error) {
        console.error('Seeding error:', error);
        return NextResponse.json(
            { error: 'Failed to seed database', details: String(error) },
            { status: 500 }
        );
    }
}