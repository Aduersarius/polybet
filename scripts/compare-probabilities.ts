import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { calculateMultipleLMSRProbabilities } from '../lib/amm';

async function main() {
    const event = await prisma.event.findFirst({
        where: { type: 'MULTIPLE', status: 'ACTIVE' },
        include: { outcomes: true }
    });

    if (!event) {
        console.log('No active MULTIPLE event found.');
        return;
    }

    console.log(`Event: ${event.title}`);
    console.log(`Liquidity Parameter (b): ${event.liquidityParameter}\n`);

    console.log('Outcome Comparison:');
    console.log('--------------------------------------------------');

    const outcomeLiquidities = new Map<string, number>();
    (event as any).outcomes.forEach((outcome: any) => {
        outcomeLiquidities.set(outcome.id, outcome.liquidity || 0);
    });

    const b = event.liquidityParameter || 10000.0;
    const calculatedProbs = calculateMultipleLMSRProbabilities(outcomeLiquidities, b);

    (event as any).outcomes.forEach((outcome: any) => {
        const storedProb = (outcome.probability || 0) * 100;
        const calculatedProb = (calculatedProbs.get(outcome.id) || 0) * 100;
        const diff = Math.abs(storedProb - calculatedProb);

        console.log(`\n${outcome.name}:`);
        console.log(`  Stored probability:    ${storedProb.toFixed(2)}%`);
        console.log(`  Calculated from liq:   ${calculatedProb.toFixed(2)}%`);
        console.log(`  Liquidity:             ${outcome.liquidity?.toFixed(2) || 0}`);
        if (diff > 0.01) {
            console.log(`  ⚠️  MISMATCH: ${diff.toFixed(2)}%`);
        } else {
            console.log(`  ✅ MATCH`);
        }
    });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
