#!/usr/bin/env ts-node
import { prisma } from '../lib/prisma';

async function setUserAsAdmin(email: string) {
    try {
        const user = await prisma.user.update({
            where: { email },
            data: { isAdmin: true }
        });

        console.log(`✅ User ${email} is now an admin!`);
        console.log(`User ID: ${user.id}`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

const email = process.argv[2];
if (!email) {
    console.error('Usage: npx tsx scripts/make-admin.ts <email>');
    process.exit(1);
}

setUserAsAdmin(email);
