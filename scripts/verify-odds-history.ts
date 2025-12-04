import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { generateHistoricalOdds } from '../lib/amm-server';
import { calculateMultipleLMSRProbabilities } from '../lib/amm';

async function main() {
    // 1. Find a MULTIPLE event with some liquidity/trades
    const event = await prisma.event.findFirst({
        where: {
            type: 'MULTIPLE',
            status: 'ACTIVE'
        },
        include: { outcomes: true }
    });

    if (!event) {
        console.log('No active MULTIPLE event found.');
        return;
    }

    console.log(`Verifying event: ${event.title} (${event.id})`);

    // 2. Calculate CURRENT probabilities from DB state
    const outcomeLiquidities = new Map<string, number>();
    event.outcomes.forEach((o: any) => {
        outcomeLiquidities.set(o.id, o.liquidity || 0);
    });
    const b = event.liquidityParameter || 10000.0;
    const currentProbs = calculateMultipleLMSRProbabilities(outcomeLiquidities, b);

    console.log('--- Current Probabilities (DB) ---');
    for (const [id, prob] of currentProbs) {
        const name = event.outcomes.find((o: any) => o.id === id)?.name;
        console.log(`${name}: ${(prob * 100).toFixed(2)}%`);
    }

    // 3. Generate Historical Odds
    console.log('\nGenerating historical odds...');
    const history = await generateHistoricalOdds(event.id, 'all');

    if (history.length === 0) {
        console.log('No history generated.');
        return;
    }

    const lastPoint = history[history.length - 1] as any;
    console.log(`\n--- Last Historical Point (${new Date(lastPoint.timestamp * 1000).toISOString()}) ---`);

    if (lastPoint.outcomes) {
        lastPoint.outcomes.forEach((o: any) => {
            console.log(`${o.name}: ${(o.probability * 100).toFixed(2)}%`);
        });

        // 4. Compare
        console.log('\n--- Comparison ---');
        let mismatch = false;
        lastPoint.outcomes.forEach((o: any) => {
            const currentProb = currentProbs.get(o.id) || 0;
            const histProb = o.probability;
            const diff = Math.abs(currentProb - histProb);

            if (diff > 0.001) { // 0.1% tolerance
                console.error(`MISMATCH for ${o.name}: DB=${(currentProb * 100).toFixed(2)}%, Hist=${(histProb * 100).toFixed(2)}%`);
                mismatch = true;
            } else {
                console.log(`MATCH for ${o.name}`);
            }
        });

        if (mismatch) {
            console.error('\n❌ Verification FAILED: Historical odds do not match current state.');
            process.exit(1);
        } else {
            console.log('\n✅ Verification PASSED: Historical odds match current state.');
        }
    } else {
        console.log('Last point has no outcomes (binary event logic used?)');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
