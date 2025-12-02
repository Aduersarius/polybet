const { prisma } = require('./lib/prisma');

async function createMultipleEvent() {
  try {
    console.log('Creating multiple outcome event...');

    // Check if event already exists
    let event = await prisma.event.findUnique({
      where: { id: 'tech-trillion-race-test' }
    });

    if (!event) {
      // Create the event
      event = await prisma.event.create({
        data: {
          id: 'tech-trillion-race-test',
          title: 'Which company will hit $1T market cap first? (Test)',
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
    }

    console.log('Event:', event.id);

    // Check if outcomes already exist
    const existingOutcomes = await prisma.outcome.findMany({
      where: { eventId: event.id }
    });

    if (existingOutcomes.length === 0) {
      // Create outcomes
      const outcomes = [
        { name: 'Apple', probability: 0.25, liquidity: 100.0, color: '#000000' },
        { name: 'Nvidia', probability: 0.30, liquidity: 120.0, color: '#76B900' },
        { name: 'Google', probability: 0.20, liquidity: 80.0, color: '#4285F4' },
        { name: 'Amazon', probability: 0.15, liquidity: 60.0, color: '#FF9900' },
        { name: 'Tesla', probability: 0.10, liquidity: 40.0, color: '#CC0000' }
      ];

      for (const outcome of outcomes) {
        await prisma.outcome.create({
          data: {
            eventId: event.id,
            name: outcome.name,
            probability: outcome.probability,
            liquidity: outcome.liquidity,
            color: outcome.color,
          }
        });
      }

      console.log('Created outcomes for the event');

      // Create AMM bot balances for each outcome
      for (const outcome of outcomes) {
        const createdOutcome = await prisma.outcome.findFirst({
          where: { eventId: event.id, name: outcome.name }
        });

        if (createdOutcome) {
          await prisma.balance.upsert({
            where: {
              userId_tokenSymbol_eventId_outcomeId: {
                userId: 'amm-bot',
                tokenSymbol: createdOutcome.id,
                eventId: event.id,
                outcomeId: createdOutcome.id
              }
            },
            update: { amount: 1000 },
            create: {
              userId: 'amm-bot',
              tokenSymbol: createdOutcome.id,
              eventId: event.id,
              outcomeId: createdOutcome.id,
              amount: 1000
            }
          });
        }
      }
    } else {
      console.log('Outcomes already exist for the event');
    }

    console.log('Multiple outcome event created successfully!');

  } catch (error) {
    console.error('Error creating multiple outcome event:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createMultipleEvent();