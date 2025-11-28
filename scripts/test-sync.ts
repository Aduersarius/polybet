import { PrismaClient } from '@prisma/client';
import { getPayload } from 'payload';
import config from '../payload.config';

// Use exported prisma from lib/prisma to test extension
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function testSync() {
    try {
        console.log('Starting sync test...');

        // 1. Create a user in Prisma (simulating BetterAuth or App usage)
        const email = `test-sync-${Date.now()}@example.com`;
        console.log(`Creating Prisma user: ${email}`);

        // Use the imported prisma instance which has the extension applied
        const prismaUser = await prisma.user.create({
            data: {
                email,
                username: 'SyncTestUser',
                name: 'Sync Test User',
            },
        });
        console.log(`Prisma user created: ${prismaUser.id}`);

        // Wait a moment for async sync to happen
        console.log('Waiting for sync...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 2. Check if user exists in Payload
        const payload = await getPayload({ config });
        const payloadUsers = await payload.find({
            collection: 'payload-users',
            where: {
                email: {
                    equals: email,
                },
            },
        });

        if (payloadUsers.docs.length > 0) {
            const syncedUser = payloadUsers.docs[0];
            console.log('SUCCESS: User found in Payload!');
            console.log(`Payload ID: ${syncedUser.id}`);
            console.log(`Synced Prisma ID: ${syncedUser.prismaId}`);

            if (syncedUser.prismaId === prismaUser.id) {
                console.log('VERIFIED: Prisma IDs match.');
            } else {
                console.error('FAILED: Prisma IDs do not match.');
            }
        } else {
            console.error('FAILED: User not found in Payload.');
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        process.exit(0);
    }
}

testSync();
