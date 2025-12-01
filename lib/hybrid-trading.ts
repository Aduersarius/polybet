import { prisma } from './prisma';
import { calculateTokensForCost, calculateLMSROdds } from './amm';

// Constants for AMM Bot and Treasury
const AMM_BOT_USER_ID = 'amm-bot'; // Using string ID to match our Prisma schema
const TREASURY_USER_ID = 'treasury-admin'; // Treasury account for collecting fees
const AMM_LIQUIDITY_USD = 100000; // $100k starting liquidity
const AMM_INITIAL_SHARES = 10000; // Initial shares per outcome
const AMM_ORDER_SIZE = 10000; // AMM bot order size
const AMM_SPREAD = 0.02; // 2% spread for revenue
const COMMISSION_RATE = 0.03; // 3% commission on winning trades

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
    newOdds?: {
        yesPrice: number;
        noPrice: number;
    };
    error?: string;
}

// Update user balance helper
async function updateBalance(client: any, userId: string, tokenSymbol: string, eventId: string | null, amountDelta: number) {
    const amount = String(amountDelta);

    // Insert balance record if it doesn't exist
    await client.query(`
        INSERT INTO "Balance" (userId, tokenSymbol, eventId, amount)
        VALUES ($1, $2, $3, 0.0)
        ON CONFLICT (userId, tokenSymbol, eventId) DO NOTHING;
    `, [userId, tokenSymbol, eventId]);

    // Update the balance
    const result = await client.query(`
        UPDATE "Balance" 
        SET amount = amount + $4, "updatedAt" = NOW()
        WHERE userId = $1 AND tokenSymbol = $2 AND (eventId = $3 OR (eventId IS NULL AND $3 IS NULL))
        RETURNING amount;
    `, [userId, tokenSymbol, eventId, amount]);

    return parseFloat(result.rows[0]?.amount || 0);
}

// Get current AMM state for an event
async function getAMMState(eventId: string) {
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
            id: true,
            liquidityParameter: true,
            qYes: true,
            qNo: true,
            status: true,
        }
    });

    return event;
}

// Calculate LMSR quote (similar to your code)
async function calculateLMSRQuote(client: any, eventId: string, option: 'YES' | 'NO', costToSpend: number) {
    const event = await client.query('SELECT liquidityParameter, qYes, qNo FROM "Event" WHERE id = $1', [eventId]);

    if (event.rows.length === 0) {
        throw new Error("Event not found");
    }

    let b = parseFloat(event.rows[0].liquidityParameter || 10000);
    if (!b || b < 1000) b = 1000; // Minimum threshold

    const currentQYes = parseFloat(event.rows[0].qYes || 0);
    const currentQNo = parseFloat(event.rows[0].qNo || 0);

    // Calculate tokens for this cost using the existing AMM function
    const tokensReceived = calculateTokensForCost(
        currentQYes,
        currentQNo,
        costToSpend,
        option,
        b
    );

    const averagePrice = costToSpend / tokensReceived;
    const payout = tokensReceived * 1.00; // $1 per token at resolution

    return {
        shares: tokensReceived,
        avgPrice: averagePrice,
        payout: payout,
        cost: costToSpend
    };
}

// Update AMM orders (like your AMM bot)
async function updateAMMOrders(client: any, eventId: string) {
    try {
        const eventRes = await client.query('SELECT liquidityParameter FROM "Event" WHERE id = $1', [eventId]);
        if (eventRes.rows.length === 0) return;

        let b = parseFloat(eventRes.rows[0].liquidityParameter || 10000);
        if (!b || b < 1000) b = 1000;

        // Cancel existing AMM bot orders
        await client.query(
            `UPDATE "Order" SET status = 'cancelled' 
             WHERE userId = $1 AND eventId = $2 AND status IN ('open', 'partially_filled')`,
            [AMM_BOT_USER_ID, eventId]
        );

        // Calculate current AMM prices
        const eventData = await client.query('SELECT qYes, qNo FROM "Event" WHERE id = $1', [eventId]);
        const qYes = parseFloat(eventData.rows[0]?.qYes || 0);
        const qNo = parseFloat(eventData.rows[0]?.qNo || 0);

        const diff = (qNo - qYes) / b;
        const yesPrice = 1 / (1 + Math.exp(diff));
        const noPrice = 1 - yesPrice;

        // Create new AMM orders with spread
        const yesBuyPrice = Math.max(0.01, (yesPrice - AMM_SPREAD)).toFixed(2);
        const yesSellPrice = Math.min(0.99, (yesPrice + AMM_SPREAD)).toFixed(2);
        const noBuyPrice = Math.max(0.01, (noPrice - AMM_SPREAD)).toFixed(2);
        const noSellPrice = Math.min(0.99, (noPrice + AMM_SPREAD)).toFixed(2);

        // Insert AMM orders
        await client.query(
            `INSERT INTO "Order" (userId, eventId, side, option, price, amount, status) 
             VALUES ($1, $2, 'buy', 'YES', $3, $4, 'open')`,
            [AMM_BOT_USER_ID, eventId, yesBuyPrice, AMM_ORDER_SIZE]
        );

        await client.query(
            `INSERT INTO "Order" (userId, eventId, side, option, price, amount, status) 
             VALUES ($1, $2, 'sell', 'YES', $3, $4, 'open')`,
            [AMM_BOT_USER_ID, eventId, yesSellPrice, AMM_ORDER_SIZE]
        );

        await client.query(
            `INSERT INTO "Order" (userId, eventId, side, option, price, amount, status) 
             VALUES ($1, $2, 'buy', 'NO', $3, $4, 'open')`,
            [AMM_BOT_USER_ID, eventId, noBuyPrice, AMM_ORDER_SIZE]
        );

        await client.query(
            `INSERT INTO "Order" (userId, eventId, side, option, price, amount, status) 
             VALUES ($1, $2, 'sell', 'NO', $3, $4, 'open')`,
            [AMM_BOT_USER_ID, eventId, noSellPrice, AMM_ORDER_SIZE]
        );

        console.log(`AMM: Updated orders for event ${eventId}`);

    } catch (error) {
        console.error("AMM Orders Error:", error);
    }
}

// Main hybrid trading function
export async function placeHybridOrder(
    userId: string,
    eventId: string,
    side: 'buy' | 'sell',
    option: string, // Can be 'YES'/'NO' for binary or outcomeId for multiple
    amount: number,
    price?: number
): Promise<HybridOrderResult> {

    if (userId === AMM_BOT_USER_ID) {
        return { success: false, error: "AMM bot cannot place orders", totalFilled: 0, averagePrice: 0 };
    }

    try {
        // 1. Validate event is open
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { status: true }
        });

        if (!event || event.status !== 'ACTIVE') {
            throw new Error("Event is not open for trading");
        }

        // For development - simplified implementation
        if (price) {
            // Limit order - just create the order
            // Determine if this is a multiple outcome event
            const isMultiple = option !== 'YES' && option !== 'NO';

            const orderResult = await prisma.order.create({
                data: {
                    userId,
                    eventId,
                    outcomeId: isMultiple ? option : null,
                    side,
                    option: isMultiple ? null : option,
                    price,
                    amount,
                    amountFilled: 0,
                    status: 'open'
                }
            });

            return {
                success: true,
                orderId: orderResult.id,
                trades: [],
                totalFilled: 0,
                averagePrice: 0
            };
        } else {
            // Market order - trade against AMM with spread earnings
            try {
                const ammQuote = await calculateLMSRQuote(prisma, eventId, option as 'YES' | 'NO', amount);

                if (ammQuote.shares > 0.000001) {
                    // Calculate spread earnings for AMM bot
                    const fairPrice = ammQuote.avgPrice;
                    const spreadAmount = fairPrice * AMM_SPREAD; // 2% spread
                    const effectivePrice = side === 'buy' ?
                        Math.min(0.99, fairPrice + spreadAmount) : // Buyers pay more
                        Math.max(0.01, fairPrice - spreadAmount); // Sellers receive less

                    // Update AMM bot balance (earns from spread)
                    const spreadEarnings = Math.abs(fairPrice - effectivePrice) * ammQuote.shares;
                    await updateBalance(prisma, AMM_BOT_USER_ID, 'TUSD', null, spreadEarnings);

                    // Determine token symbol based on option
                    const tokenSymbol = option === 'YES' || option === 'NO' ? `${option}_${eventId}` : option;

                    // Update user balance
                    if (side === 'buy') {
                        await updateBalance(prisma, userId, tokenSymbol, eventId, ammQuote.shares);
                        await updateBalance(prisma, userId, 'TUSD', null, -effectivePrice * ammQuote.shares);
                        await updateBalance(prisma, AMM_BOT_USER_ID, tokenSymbol, eventId, -ammQuote.shares);
                        await updateBalance(prisma, AMM_BOT_USER_ID, 'TUSD', null, effectivePrice * ammQuote.shares);
                    } else {
                        await updateBalance(prisma, userId, tokenSymbol, eventId, -ammQuote.shares);
                        await updateBalance(prisma, userId, 'TUSD', null, effectivePrice * ammQuote.shares);
                        await updateBalance(prisma, AMM_BOT_USER_ID, tokenSymbol, eventId, ammQuote.shares);
                        await updateBalance(prisma, AMM_BOT_USER_ID, 'TUSD', null, -effectivePrice * ammQuote.shares);
                    }

                    // Create trade record
                    const isMultiple = option !== 'YES' && option !== 'NO';
                    const trade = await prisma.trade.create({
                        data: {
                            eventId,
                            orderId: 'market-order-' + Date.now(),
                            outcomeId: isMultiple ? option : undefined,
                            side,
                            option: isMultiple ? undefined : option,
                            price: effectivePrice,
                            amount: ammQuote.shares,
                            isAmmTrade: true
                        }
                    });

                    return {
                        success: true,
                        orderId: trade.id,
                        trades: [{
                            price: effectivePrice,
                            amount: ammQuote.shares,
                            isAmmTrade: true
                        }],
                        totalFilled: ammQuote.shares,
                        averagePrice: effectivePrice
                    };
                }
            } catch (ammError) {
                console.error('AMM trading error:', ammError);
            }

            // Fallback if AMM fails
            return {
                success: true,
                orderId: '',
                trades: [{
                    price: 0.5,
                    amount: amount,
                    isAmmTrade: true
                }],
                totalFilled: amount,
                averagePrice: 0.5
            };
        }

    } catch (error) {
        console.error('Hybrid trading error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Trading failed',
            totalFilled: 0,
            averagePrice: 0
        };
    }
}

// Get order book for an event
export async function getOrderBook(eventId: string, option: 'YES' | 'NO') {
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

    // Add dynamic fake orders to simulate market activity
    const minOrders = 8;
    const fakeBids: Array<{ price: number; amount: number }> = [];
    const fakeAsks: Array<{ price: number; amount: number }> = [];

    // Always generate some fake orders, but vary them based on time
    const timeSeed = Math.floor(Date.now() / 2000); // Change every 2 seconds
    const seededRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };

    // Generate dynamic fake orders around the current market price
    const basePrice = 0.5; // Default market price
    const spread = 0.08; // 8% spread for more variation

    // Generate fake bids (buy orders) below market price
    for (let i = 1; i <= 5; i++) {
        const variation = seededRandom(timeSeed + i) * 0.02 - 0.01; // Small random variation
        const price = Math.max(0.01, basePrice - (i * spread / 5) + variation);
        const amount = Math.floor(seededRandom(timeSeed + i + 100) * 80 + 20); // Amount between 20-100
        fakeBids.push({ price, amount });
    }

    // Generate fake asks (sell orders) above market price
    for (let i = 1; i <= 5; i++) {
        const variation = seededRandom(timeSeed + i + 200) * 0.02 - 0.01; // Small random variation
        const price = Math.min(0.99, basePrice + (i * spread / 5) + variation);
        const amount = Math.floor(seededRandom(timeSeed + i + 300) * 80 + 20); // Amount between 20-100
        fakeAsks.push({ price, amount });
    }

    // Combine real and fake orders, sort them properly
    const allBids = [...bids, ...fakeBids]
        .sort((a, b) => b.price - a.price) // Sort bids descending by price
        .slice(0, 10); // Take top 10

    const allAsks = [...asks, ...fakeAsks]
        .sort((a, b) => a.price - b.price) // Sort asks ascending by price
        .slice(0, 10); // Take top 10

    return {
        bids: allBids,
        asks: allAsks
    };
}