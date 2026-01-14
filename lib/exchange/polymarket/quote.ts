
import { polymarketTrading } from '@/lib/polymarket-trading';
import { prisma } from '@/lib/prisma';

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

const MIN_HEDGE_VALUE = 1.10; // Bulletproof minimum

/**
 * Calculates shares and execution price based on live orderbook
 */
export async function getExecutionQuote(
    tokenId: string,
    side: 'BUY' | 'SELL',
    amountUsd: number
): Promise<Quote> {
    console.log(`[Vivid-Quote] 🔍 Getting quote for ${tokenId} | Side: ${side} | AmountUSD: ${amountUsd}`);
    // 1. Fetch liquidity data
    const liq = await polymarketTrading.checkLiquidity(
        tokenId,
        side,
        5, // Minimum shares for liquidity probe
        100 // 1% slippage max
    );

    if (!liq.canHedge) {
        throw new Error(`Insufficient liquidity: ${liq.reason}`);
    }

    const price = liq.bestPrice;
    console.log(`[Vivid-Quote] 💰 Live Price: ${price} (Tick: ${liq.tickSize})`);

    if (price <= 0 || price >= 1) {
        throw new Error(`Invalid market price: ${price}`);
    }

    // Logic for amount interpretation:
    // BUY: amount is USD, we need to calculate shares.
    // SELL: amount is SHARES, we need to calculate USD value.
    const shares = side === 'BUY' ? amountUsd / price : amountUsd;
    const value = side === 'BUY' ? amountUsd : amountUsd * price;

    console.log(`[Vivid-Quote] 🧮 Result: ${shares.toFixed(6)} shares | Value: $${value.toFixed(4)}`);

    // 2. Enforce minimum for Polymarket
    if (value < MIN_HEDGE_VALUE) {
        throw new Error(`Order value $${value.toFixed(4)} is below minimum $${MIN_HEDGE_VALUE}`);
    }

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
