import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBalances() {
    try {
        console.log('Checking TUSD balances...');

        const balances = await prisma.balance.findMany({
            where: {
                tokenSymbol: 'TUSD'
            },
            include: {
                user: true
            }
        });

        console.log(`Found ${balances.length} TUSD records.`);

        const userMap = new Map();

        for (const b of balances) {
            if (!userMap.has(b.userId)) {
                userMap.set(b.userId, []);
            }
            userMap.get(b.userId).push(b);
        }

        for (const [userId, records] of userMap.entries()) {
            const email = records[0].user.email;
            const username = records[0].user.username;
            console.log(`User: ${username || 'No Name'} (${email}) [${userId}]`);

            records.forEach((r: any) => {
                console.log(`  - Balance ID: ${r.id}`);
                console.log(`    Amount: ${r.amount}`);
                console.log(`    EventId: ${r.eventId}`);
                console.log(`    OutcomeId: ${r.outcomeId}`);
                console.log(`    UpdatedAt: ${r.updatedAt}`);
            });

            if (records.length > 1) {
                console.log('  ⚠️ DUPLICATE RECORDS FOUND!');
            }
            console.log('---');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkBalances();
