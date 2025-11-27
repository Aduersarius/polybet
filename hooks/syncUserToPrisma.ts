import type { CollectionAfterChangeHook } from 'payload';
import { prisma } from '../lib/prisma';

export const syncUserToPrisma: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
    try {
        const user = doc;

        // Convert Payload user to Prisma format
        const userData = {
            email: user.email,
            username: user.username,
            description: user.description,
            // Handle avatarUrl if it's an object (media) or string
            avatarUrl: user.avatarUrl?.url || (typeof user.avatarUrl === 'string' ? user.avatarUrl : null),
            isAdmin: user.role === 'admin',
            isBanned: user.isBanned || false,
            clerkId: user.clerkId || null,
            address: user.address || null,
            // Map social links
            twitter: user.social?.twitter || null,
            discord: user.social?.discord || null,
            telegram: user.social?.telegram || null,
            website: user.social?.website || null,
        };

        if (operation === 'create') {
            // Create in Prisma
            const prismaUser = await prisma.user.create({
                data: userData,
            });

            // Update Payload with Prisma ID
            await req.payload.update({
                collection: 'payload-users',
                id: user.id,
                data: {
                    prismaId: prismaUser.id,
                },
            });

            console.log(`User synced to Prisma: ${prismaUser.id}`);
        } else if (operation === 'update' && user.prismaId) {
            // Update in Prisma
            await prisma.user.update({
                where: { id: user.prismaId },
                data: userData,
            });

            console.log(`User updated in Prisma: ${user.prismaId}`);
        }
    } catch (error) {
        console.error('Error syncing user to Prisma:', error);
        // Don't throw - we don't want to break Payload if Prisma sync fails
    }

    return doc;
};
