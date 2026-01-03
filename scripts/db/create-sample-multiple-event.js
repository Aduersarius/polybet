const { prisma } = require('../../lib/prisma.ts');

async function createSampleMultipleEvent() {
  try {
    console.log('Creating sample multiple outcome event...');

    // Create the event
    const event = await prisma.event.create({
      data: {
        title: "Which company will hit $1 trillion market cap first?",
        description: "Predict which tech giant will reach the $1 trillion valuation milestone first. This event will resolve when any of the companies reaches this milestone.",
        categories: ["TECH", "BUSINESS"],
        resolutionDate: new Date("2026-12-31"),
        status: "ACTIVE",
        type: "MULTIPLE",
        initialLiquidity: 500.0,
        liquidityParameter: 15000.0,
        creatorId: "dev-user", // Use dev-user as creator
        outcomes: {
          create: [
            {
              name: "Apple",
              probability: 0.25,
              liquidity: 100.0,
              color: "#000000"
            },
            {
              name: "Nvidia",
              probability: 0.30,
              liquidity: 120.0,
              color: "#76B900"
            },
            {
              name: "Google",
              probability: 0.20,
              liquidity: 80.0,
              color: "#4285F4"
            },
            {
              name: "Amazon",
              probability: 0.15,
              liquidity: 60.0,
              color: "#FF9900"
            },
            {
              name: "Tesla",
              probability: 0.10,
              liquidity: 40.0,
              color: "#CC0000"
            }
          ]
        }
      },
      include: {
        outcomes: true
      }
    });

    console.log('Created event:', event.id);
    console.log('Outcomes:', event.outcomes.map(o => `${o.name}: ${o.probability}`));

    // Create AMM bot balances for each outcome
    for (const outcome of event.outcomes) {
      await prisma.balance.upsert({
        where: {
          userId_tokenSymbol_eventId_outcomeId: {
            userId: 'amm-bot',
            tokenSymbol: outcome.id,
            eventId: event.id,
            outcomeId: outcome.id
          }
        },
        update: { amount: 1000 },
        create: {
          userId: 'amm-bot',
          tokenSymbol: outcome.id,
          eventId: event.id,
          outcomeId: outcome.id,
          amount: 1000
        }
      });
    }

    console.log('AMM bot balances created for all outcomes');

  } catch (error) {
    console.error('Error creating sample event:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSampleMultipleEvent();