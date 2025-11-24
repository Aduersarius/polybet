import { prisma } from './lib/prisma';

async function inspectOdds() {
    const events = await prisma.event.findMany({
        take: 5,
        select: {
            title: true,
            yesOdds: true,
            noOdds: true,
            qYes: true,
            qNo: true,
            liquidityParameter: true
        }
    });

    console.log('🔍 Inspecting Event Odds & AMM State:');
    events.forEach(e => {
        console.log(`\nEvent: ${e.title.substring(0, 40)}...`);
        console.log(`  - yesOdds: ${e.yesOdds}`);
        console.log(`  - noOdds: ${e.noOdds}`);
        console.log(`  - qYes: ${e.qYes}`);
        console.log(`  - qNo: ${e.qNo}`);
        console.log(`  - b (liquidity): ${e.liquidityParameter}`);

        // Check if odds are probabilities (0-1) or decimal odds (>1)
        if (e.yesOdds && e.yesOdds > 1.0) {
            console.log('  ⚠️  Stored as DECIMAL ODDS (e.g. 2.5)');
        } else {
            console.log('  ✅ Stored as PROBABILITY (e.g. 0.4)');
        }
    });

    await prisma.$disconnect();
}

inspectOdds();
