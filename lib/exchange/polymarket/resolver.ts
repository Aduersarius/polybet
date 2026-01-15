
import { prisma } from '@/lib/prisma';
import { polymarketTrading } from '@/lib/polymarket-trading';

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

    console.log(`[Resolver]  option=${option.toUpperCase()}, hasYES=${!!mapping.yesTokenId}, hasNO=${!!mapping.noTokenId}, defaultToken=${tokenId?.slice(-8)}`);

    // Handle YES/NO for binary markets
    if (option.toUpperCase() === 'YES' || option.toUpperCase() === 'NO') {
        // Check if we have cached token IDs
        if (option.toUpperCase() === 'YES' && mapping.yesTokenId) {
            tokenId = mapping.yesTokenId;
        } else if (option.toUpperCase() === 'NO' && mapping.noTokenId) {
            tokenId = mapping.noTokenId;
        } else {
            // Tokens not cached - fetch from Polymarket API
            console.log(`[Resolver] Fetching YES/NO tokens from Polymarket for condition ${mapping.polymarketConditionId}`);

            try {
                const tokens = await polymarketTrading.getMarketTokens(mapping.polymarketConditionId);

                // Update the database with the fetched tokens
                await prisma.polymarketMarketMapping.update({
                    where: { id: mapping.id },
                    data: {
                        yesTokenId: tokens.yesTokenId,
                        noTokenId: tokens.noTokenId
                    }
                });

                tokenId = option.toUpperCase() === 'YES' ? tokens.yesTokenId : tokens.noTokenId;
                console.log(`[Resolver] ✓ Resolved ${option.toUpperCase()} token: ${tokenId.slice(-8)}`);
            } catch (error) {
                console.error('[Resolver] Failed to fetch market tokens:', error);
                throw new Error(`Could not resolve ${option} token for event ${eventId}`);
            }
        }
    } else if (mapping.outcomeMapping) {
        // Handle outcome mapping for multiple choice
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
