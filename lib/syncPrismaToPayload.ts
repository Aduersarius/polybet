import { getPayload } from 'payload';
import config from '../payload.config';
import crypto from 'crypto';

/**
 * Syncs a user from Prisma to Payload.
 * 
 * NOTE: Currently has issues with Payload's password hashing creating values
 * that exceed database VARCHAR(500) constraints. This needs to be resolved
 * by either:
 * 1. Increasing salt/hash column sizes in the database
 * 2. Using a different approach (webhook, manual sync, etc.)
 * 3. Creating users without passwords (if Payload supports it)
 * 
 * For now, users created via BetterAuth (Prisma) will NOT automatically
 * appear in Payload Admin. Admins must be created directly in Payload.
 */
export async function syncPrismaUserToPayload(prismaUser: any) {
    try {
        const payload = await getPayload({ config });

        // Check if user already exists in Payload
        const existingUsers = await payload.find({
            collection: 'payload-users',
            where: {
                email: {
                    equals: prismaUser.email,
                },
            },
        });

        if (existingUsers.docs.length > 0) {
            const existingUser = existingUsers.docs[0];
            // If exists but no prismaId, update it
            if (!existingUser.prismaId) {
                await payload.update({
                    collection: 'payload-users',
                    id: existingUser.id,
                    data: {
                        prismaId: prismaUser.id,
                    },
                });
                console.log(`Updated existing Payload user with Prisma ID: ${prismaUser.id}`);
            }
            return;
        }

        // ISSUE: Payload's password hashing creates salt/hash values > 500 chars
        // Cannot create user via Payload API with current schema constraints
        console.warn(`Cannot sync user ${prismaUser.email} to Payload: database schema constraints`);
        console.warn(`User exists in Prisma but not in Payload. Manual sync required.`);

        // The code below is disabled due to schema issues:
        /*
        const randomPassword = crypto.randomBytes(16).toString('hex');
        
        const payloadUserData = {
            email: prismaUser.email,
            password: randomPassword,
            username: prismaUser.name || prismaUser.username || prismaUser.email.split('@')[0],
            role: 'user',
            prismaId: prismaUser.id,
        };

        const newPayloadUser = await payload.create({
            collection: 'payload-users',
            data: payloadUserData,
        });

        console.log(`Synced Prisma user to Payload: ${newPayloadUser.id}`);
        */

    } catch (error) {
        console.error('Error syncing Prisma user to Payload:', error);
    }
}
