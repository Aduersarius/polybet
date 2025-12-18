/**
 * Hybrid Odds Calculator
 * Combines Polymarket odds with our internal order book to provide
 * accurate pricing that reflects both external market and user activity
 */

interface HybridOddsInput {
  polymarketYes: number;
  polymarketNo: number;
  ourYesVolume: number;
  ourNoVolume: number;
  polymarketLiquidity: number;
}

interface HybridOddsOutput {
  yes: number;
  no: number;
  source: 'polymarket' | 'hybrid';
}

/**
 * Calculate hybrid odds by combining Polymarket prices with internal order flow
 * 
 * Strategy:
 * - If we have no user orders, use pure Polymarket odds
 * - Weight odds by liquidity (Polymarket typically has 90%+ weight)
 * - User orders create small price movements on top of Polymarket base
 */
export function calculateHybridOdds({
  polymarketYes,
  polymarketNo,
  ourYesVolume,
  ourNoVolume,
  polymarketLiquidity
}: HybridOddsInput): HybridOddsOutput {
  // If we have no user orders, use pure Polymarket odds
  if (ourYesVolume === 0 && ourNoVolume === 0) {
    return { 
      yes: polymarketYes, 
      no: polymarketNo,
      source: 'polymarket'
    };
  }
  
  // Calculate our internal odds from order imbalance
  const totalOurVolume = ourYesVolume + ourNoVolume;
  const ourYesOdds = ourYesVolume / totalOurVolume;
  const ourNoOdds = ourNoVolume / totalOurVolume;
  
  // Weight by liquidity
  // Polymarket has way more volume, so it gets most of the weight
  // Our users can only move the price a bit
  const totalLiquidity = polymarketLiquidity + totalOurVolume;
  const pmWeight = polymarketLiquidity / totalLiquidity;
  const ourWeight = totalOurVolume / totalLiquidity;
  
  // Combined odds = weighted average
  const combinedYes = polymarketYes * pmWeight + ourYesOdds * ourWeight;
  const combinedNo = polymarketNo * pmWeight + ourNoOdds * ourWeight;
  
  // Normalize to ensure they sum to 1
  const total = combinedYes + combinedNo;
  
  return {
    yes: combinedYes / total,
    no: combinedNo / total,
    source: 'hybrid'
  };
}

/**
 * Get internal order volume for an event from pending bets
 */
export async function getInternalOrderVolume(
  prisma: any,
  eventId: string
): Promise<{ yesVolume: number; noVolume: number }> {
  const orders = await prisma.bet.groupBy({
    by: ['option'],
    where: { 
      eventId: eventId,
      status: 'PENDING' 
    },
    _sum: { 
      amount: true 
    }
  });
  
  const yesOrder = orders.find((o: any) => o.option === 'YES');
  const noOrder = orders.find((o: any) => o.option === 'NO');
  
  return {
    yesVolume: yesOrder?._sum?.amount || 0,
    noVolume: noOrder?._sum?.amount || 0
  };
}

