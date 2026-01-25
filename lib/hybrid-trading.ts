/**
 * @deprecated This module is deprecated. Use trade-orchestrator.ts instead.
 * Kept for backward compatibility - forwards to new modular architecture.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { RiskManager } from './risk-manager';
import { settleEventHedges } from './exchange/polymarket';
import { HedgeManager } from './hedge-manager';
import { executeTrade } from './trade-orchestrator';
import { PLATFORM_FEE } from './constants';

// const PLATFORM_FEE = 0.02; // Moved to constants
const TREASURY_USER_ID = 'cminhk477000002s8jld69y1f'; // Using AMM bot/Treasury user for simplicity

// Constants for AMM Bot and Treasury
const AMM_BOT_USER_ID = 'cminhk477000002s8jld69y1f';
const AMM_LIQUIDITY_USD = 100000;
const AMM_ORDER_SIZE = 10000;
// Reduced spread for low user count to encourage trading
const AMM_SPREAD = 0.01; // 1% instead of 2%

export interface HybridOrderResult {
    success: boolean;
    orderId?: string;
    placeholderOrderId?: string; // Internal order ID for hedging
    trades?: Array<{
        price: number;
        amount: number;
        isAmmTrade: boolean;
        makerUserId?: string;
    }>;
    totalFilled: number;
    averagePrice: number;
    error?: string;
    warning?: string;
}

// --- HELPER: AMM Math (Standard LMSR) ---
// Cost Function: C = b * ln(sum(e^(q_i / b)))
function getLmsrCost(outcomeShares: number[], b: number): number {
    const sumExp = outcomeShares.reduce((sum, q) => sum + Math.exp(q / b), 0);
    return b * Math.log(sumExp);
}

// Calculate how many shares (delta_q) we get for a specific cost (delta_C)
// This solves the equation: C_new = C_old + cost
function calculateSharesForCost(
    currentShares: number[],
    targetIndex: number,
    costToSpend: number,
    b: number
): number {
    const sumExp = currentShares.reduce((sum, q) => sum + Math.exp(q / b), 0);

    // C_old = b * ln(sumExp)
    // C_new = C_old + costToSpend

    // We need to solve for q_new (the new quantity of the target outcome)
    // exp(C_new / b) = sum(exp(q_j / b)) for all j != target + exp(q_new / b)
    // Let K = sum(exp(q_j / b)) for all j != target
    // K = sumExp - exp(q_target / b)
    // exp(q_new / b) = exp(C_new / b) - K
    // q_new = b * ln(exp(C_new / b) - K)

    const costOld = b * Math.log(sumExp);
    const costNew = costOld + costToSpend;

    const term1 = Math.exp(costNew / b);
    const term2 = sumExp - Math.exp(currentShares[targetIndex] / b);

    // Safety check to prevent log of negative/zero
    if (term1 <= term2) {
        return 0; // Cost is too high, implies probability > 1 which is impossible in LMSR
    }

    // New q_i
    const qNew = b * Math.log(term1 - term2);

    return qNew - currentShares[targetIndex];
}
// --- HELPER: Update User Balance ---
async function updateBalance(prisma: any, userId: string, tokenSymbol: string, eventId: string | null, amountDelta: number) {
    // Revert to findFirst + update/create because native upsert with nullable fields in compound unique
    // is not supported by Prisma Client generated types (requires strict non-null matching).
    // Performance is acceptable now that AMM updates are async and RiskManager is optimized.

    // Check for existing balance
    const existing = await prisma.balance.findFirst({
        where: { userId, tokenSymbol, eventId, outcomeId: null },
        select: { id: true, amount: true },
    });

    const toNumber = (val: any) =>
        (val && typeof val.toNumber === 'function') ? val.toNumber() : Number(val);

    if (existing) {
        await prisma.balance.update({
            where: { id: existing.id },
            data: { amount: { increment: amountDelta } },
        });
    } else {
        await prisma.balance.create({
            data: { userId, tokenSymbol, eventId, outcomeId: null, amount: amountDelta }
        });
    }
}

// --- HELPER: Fetch Balance Safely ---
async function getBalanceAmount(
    prisma: any,
    userId: string,
    tokenSymbol: string,
    eventId: string | null
): Promise<number> {
    const record = await prisma.balance.findFirst({
        where: { userId, tokenSymbol, eventId, outcomeId: null },
        select: { amount: true },
    });
    if (!record) return 0;
    return record.amount instanceof Prisma.Decimal ? record.amount.toNumber() : Number(record.amount);
}

// --- HELPER: Ensure Sufficient Balance (throws) ---
async function ensureSufficientBalance(
    prisma: any,
    userId: string,
    tokenSymbol: string,
    eventId: string | null,
    required: number,
    assetLabel: string
) {
    const available = await getBalanceAmount(prisma, userId, tokenSymbol, eventId);
    if (available < required) {
        throw new Error(`Insufficient ${assetLabel}. Available: ${available.toFixed(4)}, Required: ${required.toFixed(4)}`);
    }
}

// --- HELPER: Update Probabilities in DB ---
// This ensures the frontend sees the new prices immediately after a trade
async function updateOutcomeProbabilities(prisma: any, eventId: string) {
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    });

    if (!event) return;

    // Use a safe minimum B to prevent division by zero or infinity
    let b = event.liquidityParameter || 1000;
    if (b < 100) b = 100;

    let outcomeLiquidities: number[] = [];

    if (event.type === 'MULTIPLE') {
        outcomeLiquidities = event.outcomes.map((o: any) => o.liquidity || 0);
    } else {
        // For binary, we map YES/NO to array indices 0 and 1
        outcomeLiquidities = [event.qYes || 0, event.qNo || 0];
    }

    const sumExp = outcomeLiquidities.reduce((sum, q) => sum + Math.exp(q / b), 0);

    if (event.type === 'MULTIPLE') {
        // Sort outcomes by ID to ensure consistent lock ordering and prevent deadlocks
        const sortedOutcomes = event.outcomes.sort((a: any, b: any) => a.id.localeCompare(b.id));
        for (const outcome of sortedOutcomes) {
            const prob = Math.exp((outcome.liquidity || 0) / b) / sumExp;
            await prisma.outcome.update({
                where: { id: outcome.id },
                data: { probability: prob }
            });
        }
    } else {
        // For binary events, updated probabilities are derived from qYes/qNo on read,
        // but if you have a specific field for current probability, update it here.
        // For now, we assume the frontend calculates binary prob from qYes/qNo or uses the quote API.
    }
}

// --- MAIN: Calculate Quote ---
async function calculateLMSRQuote(client: any, eventId: string, option: string, costToSpend: number) {
    const event = await (client as any).event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    });

    if (!event) throw new Error("Event not found");

    let b = event.liquidityParameter || 5000;
    // Safety check: b should be reasonably large
    if (b < 500) b = 500;

    let currentShares: number[] = [];
    let targetIndex = -1;

    if (event.type === 'MULTIPLE') {
        // Map outcomes to array. Sort by ID to ensure deterministic order mapping.
        const sortedOutcomes = event.outcomes.sort((a: any, b: any) => a.id.localeCompare(b.id));
        currentShares = sortedOutcomes.map((o: any) => o.liquidity || 0);
        targetIndex = sortedOutcomes.findIndex((o: any) => o.id === option);
    } else {
        // Binary
        currentShares = [event.qYes || 0, event.qNo || 0]; // Index 0=YES, 1=NO
        targetIndex = option === 'YES' ? 0 : 1;
    }

    if (targetIndex === -1) throw new Error("Invalid option/outcome");

    // 1. Calculate strictly using LMSR formula
    const sharesReceived = calculateSharesForCost(currentShares, targetIndex, costToSpend, b);

    if (sharesReceived <= 0 || !isFinite(sharesReceived)) {
        // Fallback for extreme prices or calculation errors
        return { shares: 0, avgPrice: 0.99, payout: 0, cost: 0 };
    }

    const averagePrice = costToSpend / sharesReceived;
    const payout = sharesReceived * 1.00;

    return {
        shares: sharesReceived,
        avgPrice: averagePrice,
        payout: payout,
        cost: costToSpend
    };
}

// --- MAIN: Place Order ---
export async function placeHybridOrder(
    userId: string,
    eventId: string,
    side: 'buy' | 'sell',
    option: string,
    amount: number, // In USD (Cost)
    price?: number
): Promise<HybridOrderResult> {
    // --- DEPRECATED IMPLEMENTATION ---
    // Forwarding to new modular architecture
    console.log('[Deprecation] placeHybridOrder called, forwarding to trade-orchestrator');

    try {
        const result = await executeTrade({
            userId,
            eventId,
            side,
            option,
            amount,
            price
        });

        // Map new TradeResult to old HybridOrderResult
        return {
            success: result.success,
            orderId: result.orderId,
            totalFilled: result.totalFilled,
            averagePrice: result.averagePrice,
            trades: [{
                price: result.averagePrice,
                amount: result.totalFilled,
                isAmmTrade: result.executionModule === 'bbook',
                makerUserId: 'AMM'
            }],
            error: result.error,
            warning: result.warning
        };
    } catch (error: any) {
        console.error('[Deprecation] Forwarding failed:', error);
        return {
            success: false,
            totalFilled: 0,
            averagePrice: 0,
            error: error.message || 'Unknown error'
        };
    }
}

// Get order book for an event
export async function getOrderBook(eventId: string, option: string) {
    // 1. Fetch event state to get REAL probability
    let event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    }) as any;

    if (!event) {
        event = await prisma.event.findUnique({
            where: { slug: eventId },
            include: { outcomes: true }
        }) as any;
    }

    if (!event) return { bids: [], asks: [] }; // Silent fallback

    const trueEventId = event.id;
    let currentProb = 0.5;

    if (event) {
        let b = event.liquidityParameter || 1000;
        if (event.type === 'MULTIPLE') {
            const outcome = event.outcomes.find((o: any) => o.id === option);
            // Re-calculate sumExp based on DB state
            const sumExp = event.outcomes.reduce((acc: number, o: any) => acc + Math.exp((o.liquidity || 0) / b), 0);
            if (outcome) currentProb = Math.exp((outcome.liquidity || 0) / b) / sumExp;
        } else {
            const sumExp = Math.exp((event.qYes || 0) / b) + Math.exp((event.qNo || 0) / b);
            const q = option === 'YES' ? event.qYes : (option === 'NO' ? event.qNo : event.outcomes.find((o: any) => o.id === option)?.probability ?? 0.5);

            // If option is a UUID but it's a binary market, we need to map it back to YES/NO or use its probability
            if (option !== 'YES' && option !== 'NO') {
                const outcome = event.outcomes.find((o: any) => o.id === option);
                if (outcome) {
                    currentProb = outcome.probability || 0.5;
                }
            } else {
                currentProb = Math.exp((q || 0) / b) / sumExp;
            }
        }
    }

    // 2. Fetch Real Limit Orders
    const [bids, asks] = await Promise.all([
        // Buy orders (bids)
        prisma.$queryRaw`
            SELECT price, SUM(amount - "amountFilled") as amount
            FROM "Order"
            WHERE "eventId" = ${eventId}
            AND "option" = ${option}
            AND "side" = 'buy'
            AND "status" IN ('open', 'partially_filled')
            GROUP BY price
            ORDER BY price DESC
            LIMIT 20
        `,
        // Sell orders (asks)
        prisma.$queryRaw`
            SELECT price, SUM(amount - "amountFilled") as amount
            FROM "Order"
            WHERE "eventId" = ${eventId}
            AND "option" = ${option}
            AND "side" = 'sell'
            AND "status" IN ('open', 'partially_filled')
            GROUP BY price
            ORDER BY price ASC
            LIMIT 20
        `
    ]);

    // 3. Generate dynamic fake orders around the REAL market price
    // Increased for low user count to simulate activity
    const fakeBids: Array<{ price: number; amount: number }> = [];
    const fakeAsks: Array<{ price: number; amount: number }> = [];

    // Change randomness every 2 seconds
    const timeSeed = Math.floor(Date.now() / 2000);
    const seededRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };

    // Center fake orders on the REAL current probability calculated above
    const basePrice = currentProb;
    const spread = 0.08; // 8% visual spread

    // Generate more fake bids (buy orders) BELOW market price
    // Generate more fake bids (buy orders) BELOW market price
    for (let i = 1; i <= 8; i++) {
        const variation = seededRandom(timeSeed + i) * 0.02 - 0.01;
        const price = Math.max(0.01, basePrice - (i * spread / 8) + variation);
        const amount = Math.floor(seededRandom(timeSeed + i + 100) * 80 + 20);
        fakeBids.push({ price, amount });
    }

    // Generate more fake asks (sell orders) ABOVE market price
    // Generate more fake asks (sell orders) ABOVE market price
    for (let i = 1; i <= 8; i++) {
        const variation = seededRandom(timeSeed + i + 200) * 0.02 - 0.01;
        const price = Math.min(0.99, basePrice + (i * spread / 8) + variation);
        const amount = Math.floor(seededRandom(timeSeed + i + 300) * 80 + 20);
        fakeAsks.push({ price, amount });
    }

    // Combine real and fake orders, sort them properly
    const allBids = [...(bids as any[]), ...fakeBids]
        .sort((a, b) => b.price - a.price)
        .slice(0, 8);

    const allAsks = [...(asks as any[]), ...fakeAsks]
        .sort((a, b) => a.price - b.price)
        .slice(0, 8);

    return {
        bids: allBids,
        asks: allAsks
    };
}

// --- MAIN: Resolve Market ---
export async function resolveMarket(eventId: string, winningOutcomeId: string) {
    // 1. Validate Event
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    }) as any;

    if (!event) throw new Error("Event not found");
    if (event.status === 'RESOLVED') throw new Error("Event already resolved");

    // 2. Settle all hedge positions for this event BEFORE processing user payouts
    // This ensures our Polymarket positions are properly accounted for
    try {
        const { hedgeManager } = await import('./hedge-manager');
        await hedgeManager.loadConfig();

        const hedgeResult = await hedgeManager.settleEventHedges(eventId, winningOutcomeId);

        if (hedgeResult.queued) {
            console.log('[Resolution] Hedge settlement workflow queued for background processing.');
        } else {
            if (hedgeResult.settledCount > 0) {
                console.log('[Resolution] Settled', hedgeResult.settledCount, 'hedges with total PnL: $', hedgeResult.totalPnl.toFixed(2));
            }

            if (hedgeResult.errors.length > 0) {
                console.warn('[Resolution]', hedgeResult.errors.length, 'hedge settlement errors:', hedgeResult.errors);
            }
        }
    } catch (hedgeError) {
        // Log but don't fail resolution if hedge settlement fails
        console.error('[Resolution] Hedge settlement failed (continuing with user payouts):', hedgeError);
    }

    // 3. Identify Winning Token Symbol
    let winningTokenSymbol = '';
    if (event.type === 'MULTIPLE') {
        const outcome = event.outcomes.find((o: any) => o.id === winningOutcomeId);
        if (!outcome) throw new Error("Invalid winning outcome ID");
        winningTokenSymbol = outcome.id;
    } else {
        if (!['YES', 'NO'].includes(winningOutcomeId)) throw new Error("Invalid binary outcome (must be YES or NO)");
        winningTokenSymbol = `${winningOutcomeId}_${eventId}`;
    }

    // 4. Process Payouts
    // Find all users holding the winning token
    // We do this in a transaction to ensure integrity

    return await prisma.$transaction(async (tx: any) => {
        // Get all balances for the winning token
        // Note: In a real large-scale app, we might batch this.
        const winners = await tx.balance.findMany({
            where: {
                tokenSymbol: winningTokenSymbol,
                amount: { gt: 0 }
            }
        });

        let totalPayout = 0;
        let totalFees = 0;

        for (const winner of winners) {
            const shares = winner.amount;
            const payout = shares * 1.00; // $1 per share
            const fee = payout * PLATFORM_FEE;
            const netPayout = payout - fee;

            // Credit User TUSD
            await updateBalance(tx, winner.userId, 'TUSD', null, netPayout);

            // Debit Winner Shares (Burn them)
            await tx.balance.update({
                where: { id: winner.id },
                data: { amount: 0 }
            });

            // Collect Fee to Treasury
            await updateBalance(tx, TREASURY_USER_ID, 'TUSD', null, fee);

            totalPayout += payout;
            totalFees += fee;
        }

        // 4. Update Event Status
        await tx.event.update({
            where: { id: eventId },
            data: {
                status: 'RESOLVED',
                result: winningOutcomeId
            }
        });

        return {
            success: true,
            winnersCount: winners.length,
            totalPayout,
            totalFees
        };
    });
}