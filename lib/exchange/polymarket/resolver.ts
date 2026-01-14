
import { prisma } from '@/lib/prisma';

export interface MarketContext {
    eventId: string;
    internalMarketId: string;
    polymarketId: string;
    polymarketConditionId: string;
    tokenId: string;
    option: string;
}

/**
 * Resolves internal event and option into Polymarket IDs
 */
export async function resolvePolymarketContext(
    eventId: string,
    option: string
): Promise<MarketContext> {
    const mapping = await prisma.polymarketMarketMapping.findUnique({
        where: { internalEventId: eventId },
    });

    if (!mapping || !mapping.isActive) {
        throw new Error(`Mapping not found or inactive for event: ${eventId}`);
    }

    let tokenId = mapping.polymarketTokenId; // Default

    // Handle outcome mapping for multiple choice or NO tokens
    if (option.toUpperCase() === 'NO') {
        if (!mapping.noTokenId) throw new Error(`NO token ID missing for event: ${eventId}`);
        tokenId = mapping.noTokenId;
    } else if (option.toUpperCase() === 'YES') {
        tokenId = mapping.yesTokenId || mapping.polymarketTokenId;
    } else if (mapping.outcomeMapping) {
        const outcomes = (mapping.outcomeMapping as any)?.outcomes;
        if (Array.isArray(outcomes)) {
            const target = outcomes.find((o: any) =>
                o.name?.toUpperCase() === option.toUpperCase() || o.internalId === option
            );
            if (target?.polymarketId) {
                tokenId = target.polymarketId;
            }
        }
    }

    if (!tokenId) {
        throw new Error(`Could not resolve tokenId for option: ${option} in event: ${eventId}`);
    }

    return {
        eventId,
        internalMarketId: mapping.id,
        polymarketId: mapping.polymarketId,
        polymarketConditionId: mapping.polymarketConditionId || '',
        tokenId,
        option
    };
}
