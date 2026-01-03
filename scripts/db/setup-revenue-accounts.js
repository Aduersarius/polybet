const { prisma } = require('../../lib/prisma.ts');

async function setupRevenueAccounts() {
  try {
    console.log('Setting up revenue accounts...');

    // Create treasury admin account
    let treasury = await prisma.user.findUnique({
      where: { id: 'treasury-admin' }
    });

    if (!treasury) {
      console.log('Creating treasury admin account...');
      treasury = await prisma.user.create({
        data: {
          id: 'treasury-admin',
          username: 'Treasury Admin',
          email: 'treasury@polybet.com',
          isAdmin: true
        }
      });
      console.log('Created treasury account:', treasury.id);
    }

    // Create AMM bot account
    let ammBot = await prisma.user.findUnique({
      where: { id: 'amm-bot' }
    });

    if (!ammBot) {
      console.log('Creating AMM bot account...');
      ammBot = await prisma.user.create({
        data: {
          id: 'amm-bot',
          username: 'AMM Bot',
          email: 'amm@polybet.com'
        }
      });
      console.log('Created AMM bot account:', ammBot.id);
    }

    // Set up treasury balance
    let treasuryBalance = await prisma.balance.findUnique({
      where: {
        userId_tokenSymbol_eventId: {
          userId: 'treasury-admin',
          tokenSymbol: 'TUSD',
          eventId: null
        }
      }
    });

    if (!treasuryBalance || treasuryBalance.amount < 1000) {
      console.log('Setting up treasury balance...');
      treasuryBalance = await prisma.balance.upsert({
        where: {
          userId_tokenSymbol_eventId: {
            userId: 'treasury-admin',
            tokenSymbol: 'TUSD',
            eventId: null
          }
        },
        update: { amount: 1000 },
        create: {
          userId: 'treasury-admin',
          tokenSymbol: 'TUSD',
          amount: 1000
        }
      });
      console.log('Treasury balance:', treasuryBalance.amount);
    }

    // Set up AMM bot balance (large liquidity pool)
    let ammBalance = await prisma.balance.findUnique({
      where: {
        userId_tokenSymbol_eventId: {
          userId: 'amm-bot',
          tokenSymbol: 'TUSD',
          eventId: null
        }
      }
    });

    if (!ammBalance || ammBalance.amount < 100000) {
      console.log('Setting up AMM bot balance...');
      ammBalance = await prisma.balance.upsert({
        where: {
          userId_tokenSymbol_eventId: {
            userId: 'amm-bot',
            tokenSymbol: 'TUSD',
            eventId: null
          }
        },
        update: { amount: 100000 },
        create: {
          userId: 'amm-bot',
          tokenSymbol: 'TUSD',
          amount: 100000
        }
      });
      console.log('AMM bot balance:', ammBalance.amount);
    }

    console.log('Revenue accounts setup complete!');

  } catch (error) {
    console.error('Error setting up revenue accounts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupRevenueAccounts();