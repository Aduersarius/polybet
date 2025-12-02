import { prisma } from './prisma';
import { RiskManager } from './risk-manager';

const PLATFORM_FEE = 0.02; // 2% commission on winnings
const TREASURY_USER_ID = 'cminhk477000002s8jld69y1f'; // Using AMM bot/Treasury user for simplicity

// Constants for AMM Bot and Treasury
const AMM_BOT_USER_ID = 'cminhk477000002s8jld69y1f';
const AMM_LIQUIDITY_USD = 100000;
const AMM_ORDER_SIZE = 10000;
const AMM_SPREAD = 0.02;

export interface HybridOrderResult {
    success: boolean;
    orderId?: string;
    trades?: Array<{
        price: number;
        amount: number;
        isAmmTrade: boolean;
        makerUserId?: string;
    }>;
    totalFilled: number;
    averagePrice: number;
    error?: string;
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
    const existing = await prisma.balance.findFirst({
        where: { userId, tokenSymbol, eventId, outcomeId: null }
    });

    if (existing) {
        await prisma.balance.update({
            where: { id: existing.id },
            data: { amount: existing.amount + amountDelta }
        });
    } else {
        await prisma.balance.create({
            data: { userId, tokenSymbol, eventId, outcomeId: null, amount: amountDelta }
        });
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
        for (const outcome of event.outcomes) {
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
    try {
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: { outcomes: true }
        }) as any;
        if (!event || event.status !== 'ACTIVE') throw new Error("Event not open");

        // 1. Limit Order Logic (Simplified placeholder)
        if (price) {
            const isMultiple = event.type === 'MULTIPLE';
            const order = await (prisma as any).order.create({
                data: {
                    userId,
                    eventId,
                    outcomeId: isMultiple ? option : null,
                    side,
                    option: isMultiple ? null : option,
                    price,
                    amount, // Shares requested
                    amountFilled: 0,
                    status: 'open'
                }
            });
            return { success: true, orderId: order.id, totalFilled: 0, averagePrice: 0 };
        }

        // 2. Market Order (AMM Trade)

        // --- RISK MANAGEMENT: PRE-TRADE CHECK ---
        // We need to calculate the predicted price impact to check slippage
        // We'll do a dry-run of the quote first

        // Calculate Spread first to get actual cost to spend on LMSR
        // spreadAmount = amount * (AMM_SPREAD / (1 + AMM_SPREAD))
        // This ensures that (costToSpend + spread) = amount
        const spreadAmount = amount * (AMM_SPREAD / (1 + AMM_SPREAD));
        const costToSpend = amount - spreadAmount;

        const quote = await calculateLMSRQuote(prisma, eventId, option, costToSpend);

        if (!quote || quote.shares <= 0) {
            throw new Error("Insufficient liquidity or calculation error for this trade size");
        }

        // Calculate predicted probability (spot price) after trade
        // We need to fetch current state again or use what we have
        // For simplicity, we use the average price of the trade as a proxy for slippage check
        // OR better: calculate the marginal price after the trade.
        // Marginal Price = exp(q_i / b) / sum(exp(q_j / b))
        // We can get this from the event data + quote.shares

        // Let's get current prob first
        const currentEvent = await prisma.event.findUnique({
            where: { id: eventId },
            include: { outcomes: true }
        }) as any;

        if (!currentEvent) throw new Error("Event not found");

        let b = currentEvent.liquidityParameter || 1000;
        let currentProb = 0.5;
        let predictedProb = 0.5;

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

        // Validate Risk
        const riskCheck = await RiskManager.validateTrade(
            eventId,
            amount,
            side,
            option,
            currentProb,
            predictedProb
        );

        if (!riskCheck.allowed) {
            throw new Error(`Risk Check Failed: ${riskCheck.reason}`);
        }

        // --- END RISK MANAGEMENT ---

        // Apply spread (Price impact is already in quote.avgPrice, spread is extra fee)
        const effectivePrice = quote.avgPrice * (1 + AMM_SPREAD);

        // DB Transaction to ensure atomicity
        return await prisma.$transaction(async (tx: any) => {

            // 1. Update Liquidity State (CRITICAL for price movement)
            // By incrementing the liquidity (q) for the bought outcome, 
            // the probability exp(q/b) / sum(...) increases for this outcome.
            if (event.type === 'MULTIPLE') {
                await tx.outcome.update({
                    where: { id: option },
                    data: { liquidity: { increment: quote.shares } }
                });
            } else {
                const updateData = option === 'YES'
                    ? { qYes: { increment: quote.shares } }
                    : { qNo: { increment: quote.shares } };
                await tx.event.update({ where: { id: eventId }, data: updateData });
            }

            // 2. Transfers
            const tokenSymbol = event.type === 'MULTIPLE' ? option : `${option}_${eventId}`;

            // User gets Shares
            await updateBalance(tx, userId, tokenSymbol, eventId, quote.shares);
            // User pays Full Amount (Cost + Spread)
            await updateBalance(tx, userId, 'TUSD', null, -amount);

            // AMM Bot (Counterparty)
            // Bot sells shares (negative balance for bot)
            await updateBalance(tx, AMM_BOT_USER_ID, tokenSymbol, eventId, -quote.shares);

            // Bot gets Cost (to cover the risk)
            await updateBalance(tx, AMM_BOT_USER_ID, 'TUSD', null, costToSpend);

            // Bot gets Spread (Profit) - We can book this separately or just add to TUSD
            // Here we just add the remaining amount (which is the spread) to the bot
            await updateBalance(tx, AMM_BOT_USER_ID, 'TUSD', null, spreadAmount);

            // 3. Record Trade
            // For AMM trades, we need to create a placeholder order since orderId is required
            const placeholderOrder = await (tx as any).order.create({
                data: {
                    userId: AMM_BOT_USER_ID,
                    eventId,
                    outcomeId: event.type === 'MULTIPLE' ? option : null,
                    side: side === 'buy' ? 'sell' : 'buy', // Opposite side (AMM is counterparty)
                    option: event.type === 'MULTIPLE' ? null : option,
                    price: quote.avgPrice,
                    amount: quote.shares,
                    amountFilled: quote.shares,
                    status: 'filled'
                }
            });

            const marketActivity = await (tx as any).marketActivity.create({
                data: {
                    type: 'TRADE',
                    userId: AMM_BOT_USER_ID,
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

            // 4. Update Probabilities (So next quote is more expensive)
            await updateOutcomeProbabilities(tx, eventId);

            return {
                success: true,
                orderId: marketActivity.id,
                totalFilled: quote.shares,
                averagePrice: quote.avgPrice
            };
        });

    } catch (error) {
        console.error('Trading error:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
        return { success: false, error: error instanceof Error ? error.message : 'Trade failed', totalFilled: 0, averagePrice: 0 };
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
    const minOrders = 8;
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

    // Generate fake bids (buy orders) BELOW market price
    for (let i = 1; i <= 5; i++) {
        const variation = seededRandom(timeSeed + i) * 0.02 - 0.01;
        const price = Math.max(0.01, basePrice - (i * spread / 5) + variation);
        const amount = Math.floor(seededRandom(timeSeed + i + 100) * 80 + 20);
        fakeBids.push({ price, amount });
    }

    // Generate fake asks (sell orders) ABOVE market price
    for (let i = 1; i <= 5; i++) {
        const variation = seededRandom(timeSeed + i + 200) * 0.02 - 0.01;
        const price = Math.min(0.99, basePrice + (i * spread / 5) + variation);
        const amount = Math.floor(seededRandom(timeSeed + i + 300) * 80 + 20);
        fakeAsks.push({ price, amount });
    }

    // Combine real and fake orders, sort them properly
    const allBids = [...(bids as any[]), ...fakeBids]
        .sort((a, b) => b.price - a.price)
        .slice(0, 10);

    const allAsks = [...(asks as any[]), ...fakeAsks]
        .sort((a, b) => a.price - b.price)
        .slice(0, 10);

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

    // 2. Identify Winning Token Symbol
    let winningTokenSymbol = '';
    if (event.type === 'MULTIPLE') {
        const outcome = event.outcomes.find((o: any) => o.id === winningOutcomeId);
        if (!outcome) throw new Error("Invalid winning outcome ID");
        winningTokenSymbol = outcome.id;
    } else {
        if (!['YES', 'NO'].includes(winningOutcomeId)) throw new Error("Invalid binary outcome (must be YES or NO)");
        winningTokenSymbol = `${winningOutcomeId}_${eventId}`;
    }

    // 3. Process Payouts
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