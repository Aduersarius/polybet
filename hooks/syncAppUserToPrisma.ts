import type { CollectionAfterChangeHook } from 'payload';
import { prisma } from '../lib/prisma';

/**
 * Syncs isBanned status from Payload AppUsers back to Prisma User
 * This allows admins to ban users via the Payload admin panel
 */
export const syncAppUserToPrisma: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
    try {
        if (operation === 'update' && doc.prismaId) {
            // Only sync the isBanned field (admin-controlled)
            await prisma.user.update({
                where: { id: doc.prismaId },
                data: {
                    isBanned: doc.isBanned || false,
                },
            });

            console.log(`Updated Prisma user ban status: ${doc.prismaId}`);
        }
    } catch (error) {
        console.error('Error syncing AppUser to Prisma:', error);
    }

    return doc;
};
