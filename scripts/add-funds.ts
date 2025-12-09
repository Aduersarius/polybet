#!/usr/bin/env ts-node
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function addFunds(email: string, amountStr: string) {
    const amount = parseFloat(amountStr);

    if (isNaN(amount)) {
        console.error('❌ Invalid amount specified.');
        process.exit(1);
    }

    try {
        console.log(`Searching for user with email: ${email}...`);
        const user = await prisma.user.findFirst({
            where: { email: email }
        });

        if (!user) {
            console.error(`❌ User with email ${email} not found.`);
            process.exit(1);
        }

        console.log(`Found user: ${user.name || 'Unnamed'} (${user.id})`);

        // Find or create balance
        const currentBalance = await prisma.balance.findFirst({
            where: {
                userId: user.id,
                tokenSymbol: 'TUSD',
                eventId: null,
                outcomeId: null
            }
        });

        let newBalance;

        if (currentBalance) {
            console.log(`Current balance: $${currentBalance.amount.toFixed(2)}`);
            newBalance = await prisma.balance.update({
                where: { id: currentBalance.id },
                data: { amount: { increment: amount } }
            });
        } else {
            console.log('No existing TUSD balance found. Creating new record.');
            newBalance = await prisma.balance.create({
                data: {
                    userId: user.id,
                    tokenSymbol: 'TUSD',
                    amount: amount
                }
            });
        }

        console.log(`✅ Successfully added $${amount.toFixed(2)}.`);
        console.log(`🎉 New Balance: $${newBalance.amount.toFixed(2)}`);

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

const email = process.argv[2];
const amount = process.argv[3];

if (!email || !amount) {
    console.error('Usage: npx tsx scripts/add-funds.ts <email> <amount>');
    process.exit(1);
}

addFunds(email, amount);
