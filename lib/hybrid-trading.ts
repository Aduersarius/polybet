import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { RiskManager } from './risk-manager';

const PLATFORM_FEE = 0.02; // 2% commission on winnings
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
    const startPHO = Date.now();
    try {
        const startEventFetch = Date.now();
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: { outcomes: true }
        }) as any;
        console.log(`[PERF] Fetch Event: ${Date.now() - startEventFetch}ms`);
        if (!event || event.status !== 'ACTIVE') throw new Error("Event not open");

        // Check if this is a Polymarket-sourced event
        const isPolymarketEvent = event.source === 'POLYMARKET' || !!event.polymarketId;

        // 1. Limit Order Logic (Simplified placeholder)
        if (price) {
            const isMultiple = event.type === 'MULTIPLE';
            const tokenSymbol = isMultiple ? option : `${option}_${eventId}`;
            const lockedTokenSymbol = side === 'buy' ? 'TUSD_LOCKED' : `${tokenSymbol}_LOCKED`;
            const lockCost = side === 'buy' ? amount * price : amount; // buy: lock quote value; sell: lock shares

            const limitResult = await prisma.$transaction(async (tx: any) => {
                if (side === 'buy') {
                    // Ensure spendable TUSD and lock it
                    await ensureSufficientBalance(tx, userId, 'TUSD', null, lockCost, 'TUSD');
                    await updateBalance(tx, userId, 'TUSD', null, -lockCost);
                    await updateBalance(tx, userId, lockedTokenSymbol, null, lockCost);
                } else {
                    // Ensure shares and lock them
                    await ensureSufficientBalance(tx, userId, tokenSymbol, eventId, lockCost, 'shares');
                    await updateBalance(tx, userId, tokenSymbol, eventId, -lockCost);
                    await updateBalance(tx, userId, lockedTokenSymbol, eventId, lockCost);
                }

                const order = await (tx as any).order.create({
                    data: {
                        userId,
                        eventId,
                        // Ensure outcomeId is set correcty:
                        // 1. If it's a MULTIPLE event, use the outcome ID directly (option is the ID)
                        // 2. If we have a specific outcomeId passed in (e.g. for GROUPED_BINARY specific outcome trade), use it
                        // 3. Otherwise, try to find the match outcome for the option if possible, or leave null if strictly binary
                        outcomeId: isMultiple ? option : (
                            // Logic to find outcome ID for binary/grouped if feasible, otherwise null 
                            // For now, we rely on what was passed or resolved earlier if we had it.
                            // But hybrid-trading signature is (..., option, ...).
                            // If we want detailed tracking for grouped binary, we might need to look it up.
                            // Given the error was Order_outcomeId_fkey, it implies we tried to insert something invalid or null where required?
                            // Actually, Order.outcomeId is optional (nullable). The error "Foreign key constraint violated" usually happens
                            // if we insert a NON-NULL value that DOESN'T exist in the Outcome table.
                            // So if 'option' is "YES" or "NO", and we try to put that in outcomeId, it fails.
                            null
                        ),
                        side,
                        option: isMultiple ? null : option,
                        price,
                        amount, // Shares requested (sell) or shares purchasable at price (buy)
                        amountFilled: 0,
                        status: 'open'
                    }
                });

                return order;
            });

            const order = limitResult;
            return { success: true, orderId: order.id, totalFilled: 0, averagePrice: 0 };
        }

        // 2. Market Order (AMM Trade)

        // Calculate Spread first to get actual cost to spend
        const spreadAmount = amount * (AMM_SPREAD / (1 + AMM_SPREAD));
        const costToSpend = amount - spreadAmount;

        let quote: { shares: number; avgPrice: number; payout: number; cost: number };

        if (isPolymarketEvent) {
            // --- POLYMARKET EVENT: Use external pricing ---
            // Fetch price from Polymarket mapping
            const mapping = await prisma.polymarketMarketMapping.findUnique({
                where: { internalEventId: eventId }
            });

            let polyPrice = 0.5; // Default fallback
            if (mapping?.outcomeMapping) {
                const outcomeData = (mapping.outcomeMapping as any)?.outcomes;
                if (Array.isArray(outcomeData)) {
                    const targetOutcome = outcomeData.find((o: any) =>
                        o.name?.toUpperCase() === option.toUpperCase() || o.internalId === option
                    );
                    if (targetOutcome?.probability) {
                        polyPrice = targetOutcome.probability;
                    }
                }
            }

            // For Polymarket: shares = cost / price (simple division)
            const shares = costToSpend / Math.max(polyPrice, 0.01);
            quote = {
                shares,
                avgPrice: polyPrice,
                payout: shares,
                cost: costToSpend
            };

            console.log(`[TRADE] Polymarket event: Using price ${polyPrice} from mapping, shares: ${shares.toFixed(4)}`);
        } else {
            // --- INTERNAL EVENT: Use LMSR pricing ---
            quote = await calculateLMSRQuote(prisma, eventId, option, costToSpend);
        }
        console.log(`[PERF] Quote Calc (Polymarket/LMSR): ${Date.now() - startPHO}ms`); // Use PHO start as rough baselinewb for cumulative

        if (!quote || quote.shares <= 0) {
            throw new Error("Insufficient liquidity or calculation error for this trade size");
        }

        // Calculate predicted probability (spot price) after trade
        // For Polymarket events, we use the external price and don't calculate slippage
        // since our trades don't move Polymarket's order book significantly

        let currentProb = 0.5;
        let predictedProb = 0.5;

        if (isPolymarketEvent) {
            // For Polymarket: use the price we got from the mapping
            // We don't cause slippage on Polymarket (deep liquidity), so predicted = current
            currentProb = quote.avgPrice;
            predictedProb = quote.avgPrice; // No internal price impact
        } else {
            // For internal events: calculate from LMSR state
            const currentEvent = await prisma.event.findUnique({
                where: { id: eventId },
                include: { outcomes: true }
            }) as any;

            if (!currentEvent) throw new Error("Event not found");

            const b = currentEvent.liquidityParameter || 1000;

            if (currentEvent.type === 'MULTIPLE') {
                const outcome = currentEvent.outcomes.find((o: any) => o.id === option);
                const sumExp = currentEvent.outcomes.reduce((acc: number, o: any) => acc + Math.exp((o.liquidity || 0) / b), 0);
                if (outcome) {
                    currentProb = Math.exp((outcome.liquidity || 0) / b) / sumExp;

                    // Predicted
                    const newLiquidity = (outcome.liquidity || 0) + quote.shares;
                    const newSumExp = sumExp - Math.exp((outcome.liquidity || 0) / b) + Math.exp(newLiquidity / b);
                    predictedProb = Math.exp(newLiquidity / b) / newSumExp;
                }
            } else {
                const qYes = currentEvent.qYes || 0;
                const qNo = currentEvent.qNo || 0;
                const sumExp = Math.exp(qYes / b) + Math.exp(qNo / b);
                const q = option === 'YES' ? qYes : qNo;
                currentProb = Math.exp(q / b) / sumExp;

                // Predicted
                const newQ = q + quote.shares;
                const newSumExp = sumExp - Math.exp(q / b) + Math.exp(newQ / b);
                predictedProb = Math.exp(newQ / b) / newSumExp;
            }
        }

        // Validate Risk
        const riskCheck = await RiskManager.validateTrade(
            userId,
            eventId,
            amount,
            side,
            option,
            currentProb,
            predictedProb
        );
        console.log(`[PERF] Risk Check: ${Date.now() - startPHO}ms`);

        if (!riskCheck.allowed) {
            return { success: false, error: riskCheck.reason, totalFilled: 0, averagePrice: 0 };
        }
        let warning: string | undefined;

        // --- END RISK MANAGEMENT ---

        // Apply spread (Price impact is already in quote.avgPrice, spread is extra fee)
        const effectivePrice = side === 'buy'
            ? quote.avgPrice * (1 + AMM_SPREAD)
            : quote.avgPrice * (1 - AMM_SPREAD);

        // --- BALANCE SUFFICIENCY CHECKS (pre-transaction) ---
        const tokenSymbol = event.type === 'MULTIPLE' ? option : `${option}_${eventId}`;
        if (side === 'buy') {
            await ensureSufficientBalance(prisma, userId, 'TUSD', null, amount, 'TUSD');
        } else {
            await ensureSufficientBalance(prisma, userId, tokenSymbol, eventId, quote.shares, 'shares');
        }
        console.log(`[PERF] Balance Check: ${Date.now() - startPHO}ms`);

        // --- PRE-FLIGHT HEDGE EXECUTION (For Polymarket events only) ---
        // CRITICAL: Execute hedge BEFORE committing internal trade
        // This prevents unhedged positions when Polymarket is down
        let hedgePositionId: string | undefined;

        if (isPolymarketEvent) {
            const startHedge = Date.now();
            try {
                // Import hedgeManager - keep this synchronous
                const hStart = Date.now();
                console.log(`[HEDGE-PREFLIGHT] Importing hedgeManager...`);
                const { hedgeManager } = await import('./hedge-manager');
                console.log(`[HEDGE-PREFLIGHT] hedgeManager imported in ${Date.now() - hStart}ms`);
                await hedgeManager.loadConfig();

                // Check if we should hedge this order
                const canHedge = await hedgeManager.canHedge({
                    eventId,
                    size: quote.shares,
                    price: quote.avgPrice,
                    side,
                    option,
                });

                if (canHedge.feasible) {
                    console.log(`[HEDGE-PREFLIGHT] Attempting pre-flight hedge for ${quote.shares} shares @ ${quote.avgPrice}`);

                    // Execute hedge synchronously BEFORE DB commit
                    // Use a temporary order ID that we'll update after transaction
                    const hedgeResult = await hedgeManager.executeHedge({
                        userOrderId: 'PENDING', // Will update after commit
                        eventId,
                        size: quote.shares,
                        userPrice: quote.avgPrice,
                        side,
                        option,
                        polymarketTickSize: canHedge.polymarketTickSize,
                        polymarketNegRisk: canHedge.polymarketNegRisk
                    });

                    if (!hedgeResult.success) {
                        // CRITICAL: Hedge failed, reject the entire trade
                        console.error(`[HEDGE-PREFLIGHT] Hedge failed, rejecting trade:`, hedgeResult.error);
                        return {
                            success: false,
                            error: `Unable to execute trade: hedging unavailable (${hedgeResult.error}). Please try again later.`,
                            totalFilled: 0,
                            averagePrice: 0,
                        };
                    }

                    // Hedge succeeded - save position ID to link after commit
                    hedgePositionId = hedgeResult.hedgePositionId;
                    console.log(`[HEDGE-PREFLIGHT] Hedge successful, position ID: ${hedgePositionId}`);
                } else {
                    console.log(`[HEDGE-PREFLIGHT] Skipping hedge:`, canHedge.reason);
                }
            } catch (hedgeError: any) {
                // Hedge system completely failed - reject trade
                console.error(`[HEDGE-PREFLIGHT] Hedge system error:`, hedgeError);
                return {
                    success: false,
                    error: 'Unable to execute trade: hedging system unavailable. Please try again later.',
                    totalFilled: 0,
                    averagePrice: 0,
                };
            }
        }


        // DB Transaction to ensure atomicity with deadlock retry
        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[TRADE] Starting transaction attempt ${attempt}/${maxRetries} for user ${userId}, event ${eventId}, option ${option}, side ${side}, amount ${amount}`);
                const result = await prisma.$transaction(async (tx: any) => {
                    console.log(`[TRADE] Transaction started for ${eventId}:${option}`);

                    // 1. Update Liquidity State (CRITICAL for price movement)
                    // SKIP for Polymarket events - their prices come from external source
                    // For buy: increment liquidity (probability increases)
                    // For sell: decrement liquidity (probability decreases)
                    if (!isPolymarketEvent) {
                        const liquidityDelta = side === 'buy' ? quote.shares : -quote.shares;
                        if (event.type === 'MULTIPLE') {
                            console.log(`[TRADE] Updating outcome ${option} liquidity by ${liquidityDelta}`);
                            await tx.outcome.update({
                                where: { id: option },
                                data: { liquidity: { increment: liquidityDelta } }
                            });
                        } else {
                            const updateData = option === 'YES'
                                ? { qYes: { increment: liquidityDelta } }
                                : { qNo: { increment: liquidityDelta } };
                            console.log(`[TRADE] Updating event ${eventId} ${option} by ${liquidityDelta}`);
                            await tx.event.update({ where: { id: eventId }, data: updateData });
                        }
                    } else {
                        console.log(`[TRADE] Polymarket event - skipping internal liquidity update`);
                    }

                    // 2. Transfers
                    console.log(`[TRADE] Token symbol: ${tokenSymbol}`);

                    // User shares delta: + for buy, - for sell
                    const userSharesDelta = side === 'buy' ? quote.shares : -quote.shares;
                    // User TUSD delta: -amount for buy, +amount for sell
                    const userTusdDelta = side === 'buy' ? -amount : amount;

                    // AMM shares delta: opposite of user
                    const ammSharesDelta = -userSharesDelta;
                    // AMM TUSD delta: for buy gets costToSpend + spread, for sell pays costToSpend - spread
                    const ammTusdDelta = side === 'buy' ? (costToSpend + spreadAmount) : -(costToSpend - spreadAmount);

                    await updateBalance(tx, userId, tokenSymbol, eventId, userSharesDelta);
                    await updateBalance(tx, userId, 'TUSD', null, userTusdDelta);

                    // OPTIMIZATION: Move AMM balance updates out of critical transaction
                    // The AMM bot is a shared resource and updating it inside the user's transaction
                    // creates a choke point (lock contention) for all concurrent trades.
                    // We can safely update the AMM balance asynchronously or after commit.
                    // Note: We'll do it after commit in the main flow.

                    // 3. Record Trade
                    // For AMM trades, we need to create a placeholder order since orderId is required
                    console.log(`[TRADE] Creating placeholder order (Start DB insert)`);
                    const placeholderOrder = await (tx as any).order.create({
                        data: {
                            userId: AMM_BOT_USER_ID,
                            eventId,
                            // Ensure valid foreign key: only set outcomeId if it's a valid ID (from MULTIPLE event logic), otherwise null
                            outcomeId: event.type === 'MULTIPLE' ? option : null,
                            side: side === 'buy' ? 'sell' : 'buy', // Opposite side (AMM is counterparty)
                            option: event.type === 'MULTIPLE' ? null : option,
                            price: quote.avgPrice,
                            amount: quote.shares,
                            amountFilled: quote.shares,
                            status: 'filled'
                        }
                    });

                    console.log(`[TRADE] Creating market activity (Order created: ${placeholderOrder.id})`);
                    const marketActivity = await (tx as any).marketActivity.create({
                        data: {
                            type: 'TRADE',
                            userId: userId, // Use the actual user's ID
                            eventId,
                            outcomeId: event.type === 'MULTIPLE' ? option : undefined,
                            option: event.type === 'MULTIPLE' ? undefined : option,
                            side,
                            amount: quote.shares,
                            price: quote.avgPrice,
                            isAmmInteraction: true,
                            orderId: placeholderOrder.id
                        }
                    });

                    console.log(`[TRADE] Creating order execution`);
                    // Create OrderExecution record for tracking fills
                    await (tx as any).orderExecution.create({
                        data: {
                            orderId: placeholderOrder.id,
                            amount: quote.shares,
                            price: quote.avgPrice,
                        }
                    });

                    console.log(`[TRADE] DB Inserts done`);

                    // 4. Update Probabilities (So next quote is more expensive)
                    // Skip for Polymarket events - probabilities come from external source
                    if (!isPolymarketEvent) {
                        console.log(`[TRADE] Updating probabilities`);
                        await updateOutcomeProbabilities(tx, eventId);
                    }

                    // 5. Link pre-flight hedge to actual order (if hedge was executed)
                    if (hedgePositionId) {
                        console.log(`[TRADE] Linking hedge position ${hedgePositionId} to order ${placeholderOrder.id}`);
                        await tx.hedgePosition.update({
                            where: { id: hedgePositionId },
                            data: { userOrderId: placeholderOrder.id },
                        });
                    }

                    console.log(`[TRADE] Transaction completed successfully on attempt ${attempt}`);
                    return {
                        success: true,
                        orderId: marketActivity.id,
                        placeholderOrderId: placeholderOrder.id,
                        totalFilled: quote.shares,
                        averagePrice: quote.avgPrice,
                        warning,
                        // Pass data needed for async AMM updates
                        ammData: {
                            tokenSymbol,
                            // eventId is available
                            ammSharesDelta,
                            ammTusdDelta
                        }
                    };
                });

                // Post-transaction tasks
                if (result.success) {
                    // Update AMM balances asynchronously (fire and forget for latency)
                    console.log('[TRADE] Updating AMM balances asynchronously...');
                    const ammData = (result as any).ammData;
                    if (ammData) {
                        // Use global prisma, not tx
                        Promise.all([
                            updateBalance(prisma, AMM_BOT_USER_ID, ammData.tokenSymbol, eventId, ammData.ammSharesDelta),
                            updateBalance(prisma, AMM_BOT_USER_ID, 'TUSD', null, ammData.ammTusdDelta)
                        ]).catch(err => {
                            console.error('[TRADE] Failed to update AMM balance (non-critical):', err);
                        });
                    }
                }


                // NOTE: For Polymarket events, hedge was already executed in pre-flight (before transaction)
                // Only run async hedging for non-Polymarket events as fallback
                if (result.success && result.placeholderOrderId && !isPolymarketEvent) {
                    // Import hedgeManager dynamically to avoid circular dependencies
                    import('./hedge-manager').then(async ({ hedgeManager }) => {
                        // Import Sentry for error tracking
                        const Sentry = await import('@sentry/nextjs').catch(() => null);

                        // Create Sentry scope for hedge operation
                        const hedgeScope = Sentry ? Sentry.getCurrentScope() : null;
                        if (hedgeScope) {
                            hedgeScope.setContext('hedge', {
                                orderId: result.placeholderOrderId,
                                eventId,
                                size: quote.shares,
                                price: quote.avgPrice,
                                side,
                            });
                        }

                        try {
                            hedgeScope?.addBreadcrumb({ message: 'Loading hedge config', category: 'hedge' });
                            await hedgeManager.loadConfig();

                            // Check if we should hedge this order
                            hedgeScope?.addBreadcrumb({ message: 'Checking hedge feasibility', category: 'hedge' });
                            const canHedge = await hedgeManager.canHedge({
                                eventId,
                                size: quote.shares,
                                price: quote.avgPrice,
                                side,
                                option,
                            });

                            if (canHedge.feasible) {
                                console.log(`[HEDGE] Attempting to hedge order ${result.placeholderOrderId}`);
                                hedgeScope?.addBreadcrumb({ message: 'Executing hedge', category: 'hedge' });

                                // Execute hedge asynchronously
                                const hedgeResult = await hedgeManager.executeHedge({
                                    userOrderId: result.placeholderOrderId!,
                                    eventId,
                                    size: quote.shares,
                                    userPrice: quote.avgPrice,
                                    side,
                                    option,
                                });

                                if (hedgeResult.success) {
                                    console.log(`[HEDGE] Successfully hedged order ${result.placeholderOrderId}`);
                                } else {
                                    console.warn(`[HEDGE] Failed to hedge order ${result.placeholderOrderId}:`, hedgeResult.error);
                                    // Report hedge failure to Sentry
                                    Sentry?.captureException(new Error(`Hedge failed: ${hedgeResult.error}`), {
                                        level: 'warning',
                                        tags: { component: 'hedging' },
                                    });
                                }
                            } else {
                                console.log(`[HEDGE] Skipping hedge for order ${result.placeholderOrderId}:`, canHedge.reason);
                            }
                        } catch (err) {
                            console.error(`[HEDGE] Error in hedge pipeline:`, err);
                            // Report to Sentry with full context
                            Sentry?.captureException(err, {
                                level: 'error',
                                tags: { component: 'hedging' },
                            });
                        }
                    }).catch((err) => {
                        console.error(`[HEDGE] Error importing hedge manager:`, err);
                    });
                }

                return result;

            } catch (error) {
                lastError = error;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const isDeadlock = errorMessage.toLowerCase().includes('deadlock');

                if (isDeadlock && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 100; // Exponential backoff: 200ms, 400ms, 800ms
                    console.warn(`[DEADLOCK] Attempt ${attempt} failed, retrying in ${delay}ms for user ${userId}, event ${eventId}, option ${option}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // If not a deadlock or max retries reached, re-throw
                throw error;
            }
        }

        // If we get here, all retries failed
        throw lastError;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isDeadlock = errorMessage.toLowerCase().includes('deadlock');

        if (isDeadlock) {
            console.error('[DEADLOCK] Detected deadlock for user %s, event %s, option %s, side %s, amount %s', userId, eventId, option, side, amount);
            console.error('Deadlock error details:', errorMessage);
            console.error('Deadlock stack:', error instanceof Error ? error.stack : 'No stack');
        } else {
            console.error('Trading error:', error);
            console.error('Error details:', errorMessage);
            console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
        }

        return { success: false, error: errorMessage, totalFilled: 0, averagePrice: 0 };
    }
}

// Get order book for an event
export async function getOrderBook(eventId: string, option: string) {
    // 1. Fetch event state to get REAL probability
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    }) as any;

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
            const q = option === 'YES' ? event.qYes : event.qNo;
            currentProb = Math.exp((q || 0) / b) / sumExp;
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

        if (hedgeResult.settledCount > 0) {
            console.log(`[Resolution] Settled ${hedgeResult.settledCount} hedges with total PnL: $${hedgeResult.totalPnl.toFixed(2)}`);
        }

        if (hedgeResult.errors.length > 0) {
            console.warn(`[Resolution] ${hedgeResult.errors.length} hedge settlement errors:`, hedgeResult.errors);
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
    }, {
        maxWait: 10000, // Wait longer for lock
        timeout: 20000  // Allow longer execution time for resolution
    });
}