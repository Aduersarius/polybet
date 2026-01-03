import 'dotenv/config';
import { prisma } from '../../lib/prisma';
import { calculateMultipleLMSRProbabilities } from '../../lib/amm';

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
    console.log(`Liquidity Parameter (b): ${event.liquidityParameter}`);

    const outcomeLiquidities = new Map<string, number>();
    (event as any).outcomes.forEach((outcome: any) => {
        console.log(`${outcome.name}: liquidity=${outcome.liquidity}`);
        outcomeLiquidities.set(outcome.id, outcome.liquidity || 0);
    });

    const b = event.liquidityParameter || 10000.0;
    const probabilities = calculateMultipleLMSRProbabilities(outcomeLiquidities, b);

    console.log('\nCalculated Probabilities:');
    for (const [id, prob] of probabilities) {
        const name = (event as any).outcomes.find((o: any) => o.id === id)?.name;
        console.log(`${name}: ${(prob * 100).toFixed(2)}%`);
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
