
import { polymarketTrading, estimatePolymarketFees } from '@/lib/polymarket-trading';
import { prisma } from '@/lib/prisma';
import { hedgeManager } from '@/lib/hedge-manager';

export interface Quote {
    tokenId: string;
    side: 'BUY' | 'SELL';
    price: number;
    amount: number;
    shares: number;
    value: number;
    tickSize?: string;
    negRisk?: boolean;
}

/**
 * Calculates shares and execution price based on platform probability + spread
 * For illiquid markets, we ignore orderbook and place limit orders at fair prices
 */
export async function getExecutionQuote(
    tokenId: string,
    side: 'BUY' | 'SELL',
    amountUsd: number,
    platformProb?: number // Platform's probability for this outcome
): Promise<Quote> {
    console.log(`[Vivid-Quote] 🔍 Getting quote for ${tokenId} | Side: ${side} | AmountUSD: ${amountUsd}`);

    // 1. Fetch orderbook metadata (tick size, negRisk) but ignore pricing for illiquid markets
    const liq = await polymarketTrading.checkLiquidity(
        tokenId,
        side,
        5, // Minimum shares for liquidity probe
        100 // 1% slippage max
    );

    // 2. Determine execution price
    let price: number;

    if (platformProb && platformProb > 0 && platformProb < 1) {
        // Use platform probability + spread for limit order
        const config = hedgeManager.getConfig();
        const spreadDecimal = config.minSpreadBps / 10000;

        if (side === 'BUY') {
            // User buys from us, we buy from Polymarket at lower price
            price = platformProb * (1 + spreadDecimal);
        } else {
            // User sells to us, we sell on Polymarket at higher price  
            price = platformProb * (1 - spreadDecimal);
        }

        // Clamp to valid range and round to tick size
        price = Math.max(0.01, Math.min(0.99, price));

        console.log(`[Vivid-Quote] 💰 Platform-based Price: ${price.toFixed(4)} (Platform prob: ${platformProb.toFixed(4)}, Spread: ${config.minSpreadBps}bps)`);
    } else {
        // Fallback to orderbook price if no platform probability
        price = liq.bestPrice;
        console.log(`[Vivid-Quote] 💰 Orderbook Price: ${price} (Tick: ${liq.tickSize})`);
    }

    if (price <= 0 || price >= 1) {
        throw new Error(`Invalid market price: ${price}`);
    }

    // Logic for amount interpretation:
    // BUY: amount is USD, we need to calculate shares.
    // SELL: amount is SHARES, we need to calculate USD value.
    const shares = side === 'BUY' ? amountUsd / price : amountUsd;
    const value = side === 'BUY' ? amountUsd : amountUsd * price;

    console.log(`[Vivid-Quote] 🧮 Result: ${shares.toFixed(6)} shares | Value: $${value.toFixed(4)}`);

    // Check Polymarket's 5 share minimum
    if (shares < 5) {
        const minValue = 5 * price;
        throw new Error(
            `Order size (${shares.toFixed(2)} shares) below Polymarket minimum (5 shares). ` +
            `Minimum order value at current price: $${minValue.toFixed(2)}`
        );
    }

    // 2. Economic viability check using hedge manager's configuration
    const config = hedgeManager.getConfig();
    const estimatedSpreadValue = (config.minSpreadBps / 10000) * value;
    const estimatedFees = estimatePolymarketFees(shares, price);
    const estimatedProfit = estimatedSpreadValue - estimatedFees;

    if (estimatedProfit < config.minProfitThreshold) {
        throw new Error(
            `Order unprofitable: estimated profit $${estimatedProfit.toFixed(4)} < minimum $${config.minProfitThreshold.toFixed(2)} ` +
            `(spread: $${estimatedSpreadValue.toFixed(4)}, fees: $${estimatedFees.toFixed(4)}, value: $${value.toFixed(2)})`
        );
    }

    console.log(`[Vivid-Quote] ✅ Economic viability: profit $${estimatedProfit.toFixed(4)} >= threshold $${config.minProfitThreshold.toFixed(2)}`);


    return {
        tokenId,
        side,
        price,
        amount: amountUsd,
        shares,
        value,
        tickSize: liq.tickSize,
        negRisk: liq.negRisk
    };
}

/**
 * Bulletproof balance verification
 */
export async function validateUserBalance(
    userId: string,
    side: 'buy' | 'sell',
    amount: number, // USD if BUY, Shares if SELL
    eventId: string,
    option: string
) {
    const tokenSymbol = side === 'buy' ? 'TUSD' : `${option}_${eventId}`;
    const targetEventId = side === 'buy' ? null : eventId;

    const balance = await prisma.balance.findFirst({
        where: { userId, tokenSymbol, eventId: targetEventId, outcomeId: null },
        select: { amount: true }
    });

    const available = balance?.amount ? Number(balance.amount) : 0;
    if (available < amount) {
        throw new Error(`Insufficient ${tokenSymbol}: need ${amount.toFixed(4)}, have ${available.toFixed(4)}`);
    }
}
