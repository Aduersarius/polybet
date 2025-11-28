// Use exported prisma from lib/prisma to test extension
process.env.PAYLOAD_SECRET = 'secret'; // Override for testing
import 'dotenv/config';
import { syncPrismaUserToPayload } from '../lib/syncPrismaToPayload';
import { getPayload } from 'payload';
import config from '../payload.config';

async function testSyncFunction() {
    try {
        console.log('Testing syncPrismaUserToPayload function...');

        const mockPrismaUser = {
            id: `prisma-id-${Date.now()}`,
            email: `test-func-${Date.now()}@example.com`,
            username: 'FuncTestUser',
            name: 'Func Test User',
            image: 'https://example.com/avatar.png',
        };

        console.log('Syncing mock user:', mockPrismaUser);

        await syncPrismaUserToPayload(mockPrismaUser);

        console.log('Sync called. Verifying in Payload...');

        const payload = await getPayload({ config });
        const payloadUsers = await payload.find({
            collection: 'payload-users',
            where: {
                email: {
                    equals: mockPrismaUser.email,
                },
            },
        });

        if (payloadUsers.docs.length > 0) {
            const syncedUser = payloadUsers.docs[0];
            console.log('SUCCESS: User found in Payload!');
            console.log(`Payload ID: ${syncedUser.id}`);
            console.log(`Synced Prisma ID: ${syncedUser.prismaId}`);

            if (syncedUser.prismaId === mockPrismaUser.id) {
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

testSyncFunction();
