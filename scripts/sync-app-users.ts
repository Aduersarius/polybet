import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { getPayload } from 'payload';
import config from '../payload.config';

/**
 * Syncs all users from Prisma to Payload's AppUsers collection
 * Run this script to populate/update the AppUsers collection
 */
async function syncPrismaUsersToPayload() {
    try {
        console.log('Starting sync of Prisma users to Payload AppUsers...');

        const payload = await getPayload({ config });

        // Fetch all users from Prisma
        const prismaUsers = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
        });

        console.log(`Found ${prismaUsers.length} users in Prisma`);

        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const user of prismaUsers) {
            try {
                // Check if user already exists in AppUsers collection
                const existing = await payload.find({
                    collection: 'app-users',
                    where: {
                        prismaId: {
                            equals: user.id,
                        },
                    },
                });

                const userData = {
                    prismaId: user.id,
                    email: user.email,
                    username: user.username,
                    name: user.name,
                    description: user.description,
                    isAdmin: user.isAdmin,
                    isBanned: user.isBanned,
                    address: user.address,
                    twitter: user.twitter,
                    discord: user.discord,
                    telegram: user.telegram,
                    website: user.website,
                    createdAt: user.createdAt.toISOString(),
                };

                if (existing.docs.length > 0) {
                    // Update existing
                    await payload.update({
                        collection: 'app-users',
                        id: existing.docs[0].id,
                        data: userData,
                    });
                    updated++;
                } else {
                    // Create new
                    await payload.create({
                        collection: 'app-users',
                        data: userData,
                    });
                    created++;
                }
            } catch (error) {
                console.error(`Error syncing user ${user.email}:`, error);
                errors++;
            }
        }

        console.log(`Sync complete!`);
        console.log(`Created: ${created}, Updated: ${updated}, Errors: ${errors}`);

    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        process.exit(0);
    }
}

syncPrismaUsersToPayload();
