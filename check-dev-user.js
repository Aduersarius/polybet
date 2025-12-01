const { prisma } = require('./lib/prisma');

async function main() {
  try {
    // Check if dev-user exists
    let user = await prisma.user.findUnique({
      where: { id: 'dev-user' }
    });

    if (!user) {
      console.log('Creating dev-user...');
      user = await prisma.user.create({
        data: {
          id: 'dev-user',
          username: 'Dev User',
          email: 'dev-user-' + Date.now() + '@example.com'
        }
      });
      console.log('Created user:', user);
    } else {
      console.log('User already exists:', user);
    }

    // Check balance
    let balance = await prisma.balance.findUnique({
      where: {
        userId_tokenSymbol_eventId: {
          userId: 'dev-user',
          tokenSymbol: 'TUSD',
          eventId: null
        }
      }
    });

    if (!balance || balance.amount < 10000) {
      console.log('Creating/updating balance...');
      balance = await prisma.balance.upsert({
        where: {
          userId_tokenSymbol_eventId: {
            userId: 'dev-user',
            tokenSymbol: 'TUSD',
            eventId: null
          }
        },
        update: {
          amount: Math.max(balance?.amount || 0, 10000)
        },
        create: {
          userId: 'dev-user',
          tokenSymbol: 'TUSD',
          amount: 10000
        }
      });
      console.log('Balance:', balance);
    } else {
      console.log('Balance already sufficient:', balance);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();