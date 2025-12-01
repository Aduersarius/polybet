import type { CollectionAfterChangeHook } from 'payload';
import { prisma } from '../lib/prisma';

export const syncEventToPrisma: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
    try {
        // Skip sync if disabled in context (e.g. during migration)
        if (req.context?.disableSync) {
            return doc;
        }

        const event = doc;

        // Convert Payload event to Prisma format
        const eventData = {
            title: event.title,
            description: typeof event.description === 'string' ? event.description : JSON.stringify(event.description),
            categories: event.categories || [],
            imageUrl: event.imageUrl?.url || event.imageUrl || null,
            resolutionDate: new Date(event.resolutionDate),
            status: event.status || 'ACTIVE',
            result: event.result || null,
            isHidden: event.isHidden || false,
            rules: event.rules || null,
            liquidityParameter: event.amm?.liquidityParameter || 100,
            initialLiquidity: event.amm?.initialLiquidity || 100,
        };

        if (operation === 'create') {
            // Create in Prisma
            const prismaEvent = await prisma.event.create({
                data: {
                    ...eventData,
                    creatorId: req.user?.prismaId || 'system', // Fallback to system user
                },
            });

            // Update Payload with Prisma ID
            await req.payload.update({
                collection: 'payload-events',
                id: event.id,
                data: {
                    prismaId: prismaEvent.id,
                },
            });

            console.log(`Event synced to Prisma: ${prismaEvent.id}`);
        } else if (operation === 'update' && event.prismaId) {
            // Update in Prisma
            await prisma.event.update({
                where: { id: event.prismaId },
                data: eventData,
            });

            console.log(`Event updated in Prisma: ${event.prismaId}`);
        }
    } catch (error) {
        console.error('Error syncing event to Prisma:', error);
        // Don't throw - we don't want to break Payload if Prisma sync fails
    }

    return doc;
};
