import { prisma } from '../lib/prisma';

async function checkLiability() {
    const eventId = 'tech-trillion-race';
    const AMM_BOT_USER_ID = 'cminhk477000002s8jld69y1f';

    // Get all balances for this event
    const balances = await prisma.balance.findMany({
        where: {
            eventId: eventId,
            userId: { not: AMM_BOT_USER_ID },
            tokenSymbol: { not: 'TUSD' }
        }
    });

    console.log(`Found ${balances.length} balance records for event ${eventId}:`);

    const sharesByOutcome: Record<string, number> = {};
    for (const bal of balances) {
        console.log(`- User ${bal.userId.substring(0, 10)}...: ${bal.amount} ${bal.tokenSymbol}`);
        sharesByOutcome[bal.tokenSymbol] = (sharesByOutcome[bal.tokenSymbol] || 0) + bal.amount.toNumber();
    }

    console.log('\nShares by outcome:');
    for (const [symbol, total] of Object.entries(sharesByOutcome)) {
        console.log(`- ${symbol}: ${total}`);
    }

    const maxPayout = Math.max(...Object.values(sharesByOutcome), 0);
    console.log(`\nMax potential payout (liability): $${maxPayout.toFixed(2)}`);

    await prisma.$disconnect();
}

checkLiability().catch(console.error);
