/**
 * Orderbook Activity Generator
 * 
 * Generates fake limit orders for all active events to simulate trading activity.
 * Orders are created around the current market price (probability) and update periodically.
 * 
 * Usage:
 *   npm run orderbook-activity          # Run continuously (updates every 15 seconds)
 *   npm run orderbook-activity -- --once  # Run once and exit
 * 
 * Environment Variables:
 *   ORDERBOOK_UPDATE_INTERVAL - Update interval in milliseconds (default: 15000 = 15 seconds)
 *   ORDERBOOK_CLEANUP_AGE - Age in milliseconds before cancelling old orders (default: 120000 = 2 minutes)
 * 
 * Features:
 *   - Creates 5 buy and 5 sell orders per event/outcome
 *   - Orders are priced around current market probability
 *   - Automatically cleans up old orders (older than 2 minutes)
 *   - Uses seeded randomness for consistent but changing order patterns
 *   - Supports both BINARY and MULTIPLE event types
 */

import { prisma } from '../lib/prisma';

// Configuration
const UPDATE_INTERVAL_MS = parseInt(process.env.ORDERBOOK_UPDATE_INTERVAL || '15000'); // Default: 15 seconds (4 times per minute)
const CLEANUP_AGE_MS = parseInt(process.env.ORDERBOOK_CLEANUP_AGE || '120000'); // Default: 2 minutes

// Fake user IDs for fake orders (we'll use a special marker or get real users)
const FAKE_USER_PREFIX = 'fake-order-';

interface OrderData {
    eventId: string;
    option: string | null;
    outcomeId: string | null;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
}

// Get or create a fake user for orders
async function getFakeUserId(): Promise<string> {
    // Try to find an existing fake user
    let fakeUser = await prisma.user.findFirst({
        where: {
            username: { startsWith: FAKE_USER_PREFIX }
        }
    });

    if (!fakeUser) {
        // Create a fake user for orders
        fakeUser = await prisma.user.create({
            data: {
                address: `0x${Math.random().toString(16).substring(2, 42)}`,
                username: `${FAKE_USER_PREFIX}${Date.now()}`,
                email: `fake-${Date.now()}@polybet.local`,
            }
        });
    }

    return fakeUser.id;
}

// Calculate current market price for an event/option
async function getCurrentMarketPrice(eventId: string, option: string, eventType: string): Promise<number> {
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    });

    if (!event) return 0.5;

    const b = event.liquidityParameter || 20000;

    if (eventType === 'MULTIPLE') {
        const outcome = (event as any).outcomes.find((o: any) => o.id === option);
        if (!outcome) return 0.5;
        const sumExp = (event as any).outcomes.reduce((acc: number, o: any) => 
            acc + Math.exp((o.liquidity || 0) / b), 0);
        return Math.exp((outcome.liquidity || 0) / b) / sumExp;
    } else {
        // Binary event
        const sumExp = Math.exp(((event as any).qYes || 0) / b) + Math.exp(((event as any).qNo || 0) / b);
        const q = option === 'YES' ? (event as any).qYes : (event as any).qNo;
        return Math.exp((q || 0) / b) / sumExp;
    }
}

// Generate fake orders around current market price
function generateFakeOrders(
    basePrice: number,
    eventId: string,
    option: string | null,
    outcomeId: string | null,
    seed: number
): OrderData[] {
    const orders: OrderData[] = [];
    const spread = 0.12; // 12% spread
    const numOrdersPerSide = 5; // 5 buy and 5 sell orders

    // Seeded random function for consistency
    const seededRandom = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };

    // Generate buy orders (bids) below market price
    for (let i = 1; i <= numOrdersPerSide; i++) {
        const variation = seededRandom(seed + i) * 0.03 - 0.015;
        const price = Math.max(0.01, basePrice - (i * spread / numOrdersPerSide) + variation);
        const amount = Math.floor(seededRandom(seed + i + 1000) * 150 + 50); // $50-$200

        orders.push({
            eventId,
            option,
            outcomeId,
            side: 'buy',
            price: Math.round(price * 1000) / 1000, // Round to 3 decimals
            amount
        });
    }

    // Generate sell orders (asks) above market price
    for (let i = 1; i <= numOrdersPerSide; i++) {
        const variation = seededRandom(seed + i + 2000) * 0.03 - 0.015;
        const price = Math.min(0.99, basePrice + (i * spread / numOrdersPerSide) + variation);
        const amount = Math.floor(seededRandom(seed + i + 3000) * 150 + 50); // $50-$200

        orders.push({
            eventId,
            option,
            outcomeId,
            side: 'sell',
            price: Math.round(price * 1000) / 1000, // Round to 3 decimals
            amount
        });
    }

    return orders;
}

// Clean up old fake orders
async function cleanupOldFakeOrders(userId: string) {
    const cutoffTime = new Date(Date.now() - CLEANUP_AGE_MS);
    
    const result = await prisma.order.updateMany({
        where: {
            userId,
            createdAt: { lt: cutoffTime },
            status: { in: ['open', 'partially_filled'] }
        },
        data: {
            status: 'cancelled'
        }
    });

    if (result.count > 0) {
        console.log(`[${new Date().toISOString()}] Cancelled ${result.count} old fake orders`);
    }
}

// Main function to generate orderbook activity
async function generateOrderbookActivity() {
    try {
        const fakeUserId = await getFakeUserId();
        console.log(`[${new Date().toISOString()}] Using fake user: ${fakeUserId}`);

        // Get all active events
        const events = await prisma.event.findMany({
            where: {
                status: 'ACTIVE'
            },
            include: {
                outcomes: true
            }
        });

        console.log(`[${new Date().toISOString()}] Found ${events.length} active events`);

        // Clean up old fake orders
        await cleanupOldFakeOrders(fakeUserId);

        // Time-based seed that changes every 15 seconds
        const timeSeed = Math.floor(Date.now() / 15000);

        let totalOrdersCreated = 0;

        for (const event of events) {
            const eventType = event.type || 'BINARY';

            if (eventType === 'BINARY') {
                // Generate orders for YES and NO
                for (const option of ['YES', 'NO']) {
                    const currentPrice = await getCurrentMarketPrice(event.id, option, eventType);
                    const orders = generateFakeOrders(
                        currentPrice,
                        event.id,
                        option,
                        null,
                        timeSeed + event.id.charCodeAt(0) + option.charCodeAt(0)
                    );

                    // Create orders in database
                    for (const orderData of orders) {
                        try {
                            await prisma.order.create({
                                data: {
                                    userId: fakeUserId,
                                    eventId: orderData.eventId,
                                    option: orderData.option,
                                    outcomeId: orderData.outcomeId,
                                    side: orderData.side,
                                    price: orderData.price,
                                    amount: orderData.amount,
                                    amountFilled: 0,
                                    status: 'open'
                                }
                            });
                            totalOrdersCreated++;
                        } catch (error: any) {
                            // Ignore duplicate or constraint errors
                            if (!error.message?.includes('Unique constraint') && 
                                !error.message?.includes('Foreign key constraint')) {
                                console.error(`Error creating order:`, error.message);
                            }
                        }
                    }
                }
            } else if (eventType === 'MULTIPLE') {
                // Generate orders for each outcome
                for (const outcome of (event as any).outcomes || []) {
                    const currentPrice = await getCurrentMarketPrice(event.id, outcome.id, eventType);
                    const orders = generateFakeOrders(
                        currentPrice,
                        event.id,
                        null,
                        outcome.id,
                        timeSeed + event.id.charCodeAt(0) + outcome.id.charCodeAt(0)
                    );

                    // Create orders in database
                    for (const orderData of orders) {
                        try {
                            await prisma.order.create({
                                data: {
                                    userId: fakeUserId,
                                    eventId: orderData.eventId,
                                    option: orderData.option,
                                    outcomeId: orderData.outcomeId,
                                    side: orderData.side,
                                    price: orderData.price,
                                    amount: orderData.amount,
                                    amountFilled: 0,
                                    status: 'open'
                                }
                            });
                            totalOrdersCreated++;
                        } catch (error: any) {
                            // Ignore duplicate or constraint errors
                            if (!error.message?.includes('Unique constraint') && 
                                !error.message?.includes('Foreign key constraint')) {
                                console.error(`Error creating order:`, error.message);
                            }
                        }
                    }
                }
            }
        }

        console.log(`[${new Date().toISOString()}] Created ${totalOrdersCreated} fake orders`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error generating orderbook activity:`, error);
    }
}

// Run every 15 seconds (4 times per minute)
async function startOrderbookActivityGenerator(continuous: boolean = true) {
    console.log('Starting orderbook activity generator...');
    
    if (continuous) {
        const intervalSeconds = UPDATE_INTERVAL_MS / 1000;
        const timesPerMinute = 60 / intervalSeconds;
        console.log(`Will update orderbook every ${intervalSeconds} seconds (${timesPerMinute.toFixed(1)} times per minute)`);
        console.log('Press Ctrl+C to stop');
    } else {
        console.log('Running once...');
    }
    
    // Run immediately
    await generateOrderbookActivity();

    if (continuous) {
        // Then run at configured interval
        setInterval(async () => {
            await generateOrderbookActivity();
        }, UPDATE_INTERVAL_MS);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down orderbook activity generator...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down orderbook activity generator...');
    await prisma.$disconnect();
    process.exit(0);
});

// Check command line arguments
const args = process.argv.slice(2);
const continuous = !args.includes('--once');

// Start the generator
startOrderbookActivityGenerator(continuous).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
