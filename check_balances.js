const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBalances() {
    try {
        console.log('Checking balances...');

        // Get all TUSD balances
        const balances = await prisma.balance.findMany({
            where: {
                tokenSymbol: 'TUSD'
            },
            include: {
                user: true
            }
        });

        console.log('Found', balances.length, 'TUSD balance records');

        // Group by user to see if any user has duplicates
        const userBalances = {};
        balances.forEach(b => {
            if (!userBalances[b.userId]) userBalances[b.userId] = [];
            userBalances[b.userId].push(b);
        });

        for (const userId in userBalances) {
            const userRecs = userBalances[userId];
            if (userRecs.length > 1) {
                console.log(`⚠️ User ${userId} (${userRecs[0].user.email}) has ${userRecs.length} TUSD records:`);
                userRecs.forEach(r => {
                    console.log(`   - ID: ${r.id}, Amount: ${r.amount}, EventId: ${r.eventId}, OutcomeId: ${r.outcomeId}`);
                });
            } else {
                const r = userRecs[0];
                console.log(`✅ User ${userId} (${r.user.email}): ${r.amount} TUSD (ID: ${r.id}, EventId: ${r.eventId})`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkBalances();
