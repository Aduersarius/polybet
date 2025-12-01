import { getPayload } from 'payload';
import config from '../payload.config';
import { prisma } from '../lib/prisma';

async function migrateUsers() {
    try {
        console.log('Starting migration of Users to Payload...');

        const payload = await getPayload({ config });
        const prismaUsers = await prisma.user.findMany();
        console.log(`Found ${prismaUsers.length} users in Prisma.`);

        for (const user of prismaUsers) {
            console.log(`Migrating user: ${user.email} (${user.id})`);

            const existing = await payload.find({
                collection: 'payload-users',
                where: {
                    email: { equals: user.email },
                },
            });

            if (existing.docs.length > 0) {
                console.log(`- User already exists in Payload (ID: ${existing.docs[0].id}), updating prismaId if missing.`);
                if (!existing.docs[0].prismaId) {
                    await payload.update({
                        collection: 'payload-users',
                        id: existing.docs[0].id,
                        data: { prismaId: user.id },
                        context: { disableSync: true },
                    });
                }
                continue;
            }

            // Create in Payload
            // Password handling: We can't migrate hashed passwords easily if algorithms differ,
            // but we can create the user. They might need to reset password or use SSO.
            // For now, we'll generate a random password or leave it blank if allowed (Payload requires password for auth collections usually).
            // Actually, if we use 'payload-users' for admin access, they need a password.
            // If they are just "app users", maybe they don't need admin access?
            // The user said "segregate payload part (users...)".
            // Let's assume these are app users who *might* need to be visible in Admin.

            const payloadUser = await payload.create({
                collection: 'payload-users',
                data: {
                    email: user.email,
                    username: user.username,
                    password: 'temporary-migration-password-123!', // User should reset this
                    role: user.isAdmin ? 'admin' : 'user',
                    prismaId: user.id,
                    // Map other fields
                    description: user.description,
                    avatarUrl: user.avatarUrl, // Assuming URL string
                    social: {
                        twitter: user.twitter,
                        discord: user.discord,
                        telegram: user.telegram,
                        website: user.website,
                    },
                    isAdmin: user.isAdmin,
                    isBanned: user.isBanned,
                    address: user.address,
                },
                context: {
                    disableSync: true,
                },
            });

            console.log(`+ Created in Payload: ${payloadUser.id}`);
        }

        console.log('User migration completed.');
        process.exit(0);

    } catch (error) {
        console.error('User migration failed:', error);
        process.exit(1);
    }
}

migrateUsers();
