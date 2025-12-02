import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateLMSROdds, calculateTokensForCost } from '@/lib/amm';

export const maxDuration = 60; // Increase timeout for large data generation

export async function POST() {
    try {
        console.log('Starting trade regeneration...');
        const startTime = Date.now();

        // 1. Clear existing market activity and reset events
        await (prisma as any).marketActivity.deleteMany({});
        await prisma.event.updateMany({
            data: {
                qYes: 0,
                qNo: 0,
                yesOdds: 50,
                noOdds: 50,
                liquidityParameter: 10000 // Lower for more dynamic odds
            }
        });

        // 2. Get all events and a user
        const events = await prisma.event.findMany();
        let user = await prisma.user.findFirst();

        if (!user) {
            user = await prisma.user.create({
                data: {
                    address: '0x' + Math.random().toString(16).substr(2, 40),
                    email: 'demo@example.com',
                    username: 'Demo Trader',
                }
            });
        }

        let totalTrades = 0;

        // 3. Process each event
        for (const event of events) {
            // Generate 50-200 trades per event for more realistic markets
            const tradeCount = Math.floor(Math.random() * 150) + 50;

            // Determine time range
            const eventStart = new Date(event.createdAt).getTime();
            const now = Date.now();
            const duration = now - eventStart;

            // More varied sentiment for interesting odds
            const sentiment = Math.random();
            let yesProb = 0.5;
            if (sentiment < 0.25) yesProb = 0.15 + Math.random() * 0.15; // Very bearish (15-30%)
            else if (sentiment < 0.4) yesProb = 0.3 + Math.random() * 0.15; // Bearish (30-45%)
            else if (sentiment > 0.75) yesProb = 0.7 + Math.random() * 0.15; // Very bullish (70-85%)
            else if (sentiment > 0.6) yesProb = 0.55 + Math.random() * 0.15; // Bullish (55-70%)
            else yesProb = 0.45 + Math.random() * 0.1; // Neutral (45-55%)

            console.log(`Generating ${tradeCount} trades for "${event.title}" (Sentiment: ${yesProb.toFixed(2)})...`);

            // Generate trades in memory
            const trades = [];
            for (let i = 0; i < tradeCount; i++) {
                // Random time distribution (slightly weighted towards recent?)
                // Uniform for now as requested "evenly distribute"
                const timestamp = new Date(eventStart + Math.random() * duration);

                trades.push({
                    amount: Math.random() * 990 + 10, // $10-$1000
                    option: Math.random() < yesProb ? 'YES' : 'NO',
                    userId: user.id,
                    eventId: event.id,
                    createdAt: timestamp,
                    priceAtTrade: 0.5 // Placeholder
                });
            }

            // Sort by date to replay AMM state correctly
            trades.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            // Replay AMM state
            let qYes = 0;
            let qNo = 0;
            const b = 10000.0; // Lower liquidity for more price movement

            for (const trade of trades) {
                // Calculate price BEFORE trade
                const currentOdds = calculateLMSROdds(qYes, qNo, b);
                trade.priceAtTrade = trade.option === 'YES' ? currentOdds.yesPrice : currentOdds.noPrice;

                // Update state
                const tokens = calculateTokensForCost(qYes, qNo, trade.amount, trade.option as 'YES' | 'NO', b);
                if (trade.option === 'YES') qYes += tokens;
                else qNo += tokens;
            }

            // Batch insert trades (chunking to be safe, though 6000 might fit)
            const chunkSize = 1000;
            for (let i = 0; i < trades.length; i += chunkSize) {
                const chunk = trades.slice(i, i + chunkSize);
                await (prisma as any).marketActivity.createMany({
                    data: chunk.map(trade => ({
                        ...trade,
                        type: 'BET',
                        price: trade.priceAtTrade,
                        isAmmInteraction: true
                    }))
                });
            }

            // Update event with final state
            const finalOdds = calculateLMSROdds(qYes, qNo, b);
            await prisma.event.update({
                where: { id: event.id },
                data: {
                    qYes,
                    qNo,
                    yesOdds: finalOdds.yesOdds,
                    noOdds: finalOdds.noOdds
                }
            });

            totalTrades += tradeCount;
        }

        const timeTaken = (Date.now() - startTime) / 1000;
        console.log(`✅ Generated ${totalTrades} trades in ${timeTaken.toFixed(2)}s`);

        return NextResponse.json({
            success: true,
            message: `Generated ${totalTrades} trades across ${events.length} events in ${timeTaken.toFixed(2)}s`
        });

    } catch (error) {
        console.error('Error generating trades:', error);
        return NextResponse.json(
            { error: 'Failed to generate trades' },
            { status: 500 }
        );
    }
}
