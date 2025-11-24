import { prisma } from './lib/prisma';

async function checkOdds() {
    const events = await prisma.event.findMany({
        select: { id: true, title: true, yesOdds: true, noOdds: true }
    });

    console.log('Checking odds consistency...');
    let issues = 0;
    for (const event of events) {
        const yes = event.yesOdds || 0;
        const no = event.noOdds || 0;
        const sum = yes + no;

        // Check if sum is roughly 1 (allow small float error)
        // Also check if they are suspiciously exactly 100 or 50
        if (Math.abs(sum - 1.0) > 0.01 && (yes !== 0 || no !== 0)) {
            console.log(`⚠️  Event "${event.title}" has inconsistent odds: YES=${yes}, NO=${no}, SUM=${sum}`);
            issues++;
        }

        if (yes > 1.0 || no > 1.0) {
            console.log(`🚨 Event "${event.title}" has odds > 1.0: YES=${yes}, NO=${no}`);
            issues++;
        }
    }

    if (issues === 0) {
        console.log('✅ All events have consistent odds (sum ~ 1.0)');
    } else {
        console.log(`❌ Found ${issues} events with inconsistent odds`);
    }

    await prisma.$disconnect();
}

checkOdds();
