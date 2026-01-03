const { prisma } = require('../../lib/prisma');

async function createMultipleEvents() {
  try {
    console.log('Creating multiple outcome events...');

    // Event 1: Tech trillion race
    const event1 = await prisma.event.upsert({
      where: { id: 'tech-trillion-race' },
      update: {},
      create: {
        id: 'tech-trillion-race',
        title: 'Which company will hit $1T market cap first?',
        description: 'Predict which tech giant will reach the $1 trillion valuation milestone first. This event will resolve when any of the companies reaches this milestone.',
        categories: ['TECH', 'BUSINESS'],
        resolutionDate: new Date('2026-12-31'),
        status: 'ACTIVE',
        type: 'MULTIPLE',
        initialLiquidity: 500.0,
        liquidityParameter: 15000.0,
        creatorId: 'dev-user',
      }
    });

    const outcomes1 = [
      { name: 'Apple', probability: 0.25, liquidity: 100.0, color: '#000000' },
      { name: 'Nvidia', probability: 0.30, liquidity: 120.0, color: '#76B900' },
      { name: 'Google', probability: 0.20, liquidity: 80.0, color: '#4285F4' },
      { name: 'Amazon', probability: 0.15, liquidity: 60.0, color: '#FF9900' },
      { name: 'Tesla', probability: 0.10, liquidity: 40.0, color: '#CC0000' }
    ];

    for (const outcome of outcomes1) {
      await prisma.outcome.upsert({
        where: {
          eventId_name: {
            eventId: event1.id,
            name: outcome.name
          }
        },
        update: outcome,
        create: {
          eventId: event1.id,
          ...outcome
        }
      });
    }

    // Event 2: Largest company June
    const event2 = await prisma.event.upsert({
      where: { id: 'largest-company-june-2025' },
      update: {},
      create: {
        id: 'largest-company-june-2025',
        title: 'Largest company by market cap end of June 2025?',
        description: 'Which company will have the highest market capitalization at the end of June 2025?',
        categories: ['BUSINESS', 'FINANCE'],
        resolutionDate: new Date('2025-06-30'),
        status: 'ACTIVE',
        type: 'MULTIPLE',
        initialLiquidity: 300.0,
        liquidityParameter: 12000.0,
        creatorId: 'dev-user',
      }
    });

    const outcomes2 = [
      { name: 'Microsoft', probability: 0.22, liquidity: 80.0, color: '#00BCF2' },
      { name: 'Apple', probability: 0.20, liquidity: 75.0, color: '#000000' },
      { name: 'Nvidia', probability: 0.18, liquidity: 70.0, color: '#76B900' },
      { name: 'Google', probability: 0.15, liquidity: 60.0, color: '#4285F4' },
      { name: 'Amazon', probability: 0.12, liquidity: 50.0, color: '#FF9900' },
      { name: 'Meta', probability: 0.08, liquidity: 35.0, color: '#1877F2' },
      { name: 'Tesla', probability: 0.05, liquidity: 20.0, color: '#CC0000' }
    ];

    for (const outcome of outcomes2) {
      await prisma.outcome.upsert({
        where: {
          eventId_name: {
            eventId: event2.id,
            name: outcome.name
          }
        },
        update: outcome,
        create: {
          eventId: event2.id,
          ...outcome
        }
      });
    }

    // Event 3: US Presidential Election
    const event3 = await prisma.event.upsert({
      where: { id: 'us-presidential-2024' },
      update: {},
      create: {
        id: 'us-presidential-2024',
        title: 'Who will win the 2024 US Presidential Election?',
        description: 'Predict the winner of the 2024 United States Presidential Election.',
        categories: ['POLITICS', 'ELECTIONS'],
        resolutionDate: new Date('2024-11-05'),
        status: 'ACTIVE',
        type: 'MULTIPLE',
        initialLiquidity: 600.0,
        liquidityParameter: 18000.0,
        creatorId: 'dev-user',
      }
    });

    const outcomes3 = [
      { name: 'Donald Trump', probability: 0.48, liquidity: 180.0, color: '#C8102E' },
      { name: 'Kamala Harris', probability: 0.45, liquidity: 170.0, color: '#0033A0' },
      { name: 'Other', probability: 0.07, liquidity: 30.0, color: '#666666' }
    ];

    for (const outcome of outcomes3) {
      await prisma.outcome.upsert({
        where: {
          eventId_name: {
            eventId: event3.id,
            name: outcome.name
          }
        },
        update: outcome,
        create: {
          eventId: event3.id,
          ...outcome
        }
      });
    }

    console.log('Successfully created 3 multiple outcome events!');

  } catch (error) {
    console.error('Error creating multiple outcome events:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createMultipleEvents();