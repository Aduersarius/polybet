import { prisma } from './lib/prisma';

async function checkWithdrawalTable() {
    try {
        // Try to query the Withdrawal table to see if idempotencyKey exists
        const result = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'Withdrawal' AND column_name = 'idempotencyKey'` as any[];
        if (result.length > 0) {
            console.log('✅ idempotencyKey column exists in Withdrawal table');
        } else {
            console.log('❌ idempotencyKey column does NOT exist in Withdrawal table');
        }
    } catch (error) {
        console.error('Error checking table:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkWithdrawalTable();