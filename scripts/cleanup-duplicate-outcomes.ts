/**
 * Cleanup script to fix duplicate Yes/No outcomes in binary events
 * 
 * This script:
 * 1. Finds all events with more than 2 outcomes that are actually binary (have Yes/No duplicates)
 * 2. Merges duplicate outcomes (e.g., "Yes" and "YES" into single "YES")
 * 3. Updates OddsHistory records to point to the canonical outcome
 * 4. Deletes the duplicate outcomes
 * 
 * Run with: npx tsx scripts/cleanup-duplicate-outcomes.ts
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
    console.log('🔍 Finding events with duplicate Yes/No outcomes...\n');

    // Find all events with their outcomes
    const events = await prisma.event.findMany({
        where: {
            source: 'POLYMARKET',
        },
        include: {
            outcomes: {
                orderBy: { createdAt: 'asc' },
            },
        },
    });

    let fixedCount = 0;
    let errorCount = 0;

    for (const event of events) {
        const outcomes = event.outcomes;

        // Group outcomes by normalized name (case-insensitive)
        type OutcomeType = (typeof outcomes)[number];
        const outcomesByNormalizedName = new Map<string, OutcomeType[]>();

        for (const outcome of outcomes) {
            const normalizedName = outcome.name.toLowerCase();
            if (!outcomesByNormalizedName.has(normalizedName)) {
                outcomesByNormalizedName.set(normalizedName, []);
            }
            outcomesByNormalizedName.get(normalizedName)!.push(outcome);
        }

        // Check if this is a binary event with duplicates
        const yesOutcomes = outcomesByNormalizedName.get('yes') || [];
        const noOutcomes = outcomesByNormalizedName.get('no') || [];

        const hasYesDuplicates = yesOutcomes.length > 1;
        const hasNoDuplicates = noOutcomes.length > 1;

        if (!hasYesDuplicates && !hasNoDuplicates) {
            continue;
        }

        console.log(`\n📊 Event: "${event.title}" (${event.id})`);
        console.log(`   Outcomes: ${outcomes.map((o: any) => `"${o.name}"`).join(', ')}`);

        try {
            // Process YES duplicates
            if (hasYesDuplicates) {
                const canonical = yesOutcomes[0];
                const duplicates = yesOutcomes.slice(1);

                console.log(`   🔀 Merging ${duplicates.length} YES duplicate(s) into "${canonical.name}" (${canonical.id})`);

                for (const dup of duplicates) {
                    // Update OddsHistory records to point to canonical
                    const historyUpdated = await prisma.oddsHistory.updateMany({
                        where: { outcomeId: dup.id },
                        data: { outcomeId: canonical.id },
                    });
                    console.log(`      - Updated ${historyUpdated.count} OddsHistory records from ${dup.id}`);

                    // Update MarketActivity records
                    const activityUpdated = await prisma.marketActivity.updateMany({
                        where: { outcomeId: dup.id },
                        data: { outcomeId: canonical.id },
                    });
                    if (activityUpdated.count > 0) {
                        console.log(`      - Updated ${activityUpdated.count} MarketActivity records from ${dup.id}`);
                    }

                    // Delete the duplicate outcome
                    await prisma.outcome.delete({ where: { id: dup.id } });
                    console.log(`      - Deleted duplicate outcome "${dup.name}" (${dup.id})`);
                }

                // Rename to canonical uppercase form
                if (canonical.name !== 'YES') {
                    await prisma.outcome.update({
                        where: { id: canonical.id },
                        data: { name: 'YES' },
                    });
                    console.log(`      - Renamed "${canonical.name}" to "YES"`);
                }
            }

            // Process NO duplicates
            if (hasNoDuplicates) {
                const canonical = noOutcomes[0];
                const duplicates = noOutcomes.slice(1);

                console.log(`   🔀 Merging ${duplicates.length} NO duplicate(s) into "${canonical.name}" (${canonical.id})`);

                for (const dup of duplicates) {
                    // Update OddsHistory records to point to canonical
                    const historyUpdated = await prisma.oddsHistory.updateMany({
                        where: { outcomeId: dup.id },
                        data: { outcomeId: canonical.id },
                    });
                    console.log(`      - Updated ${historyUpdated.count} OddsHistory records from ${dup.id}`);

                    // Update MarketActivity records
                    const activityUpdated = await prisma.marketActivity.updateMany({
                        where: { outcomeId: dup.id },
                        data: { outcomeId: canonical.id },
                    });
                    if (activityUpdated.count > 0) {
                        console.log(`      - Updated ${activityUpdated.count} MarketActivity records from ${dup.id}`);
                    }

                    // Delete the duplicate outcome
                    await prisma.outcome.delete({ where: { id: dup.id } });
                    console.log(`      - Deleted duplicate outcome "${dup.name}" (${dup.id})`);
                }

                // Rename to canonical uppercase form
                if (canonical.name !== 'NO') {
                    await prisma.outcome.update({
                        where: { id: canonical.id },
                        data: { name: 'NO' },
                    });
                    console.log(`      - Renamed "${canonical.name}" to "NO"`);
                }
            }

            // Track which outcome IDs have been deleted
            const deletedIds = new Set<string>();
            if (hasYesDuplicates) {
                yesOutcomes.slice(1).forEach(o => deletedIds.add(o.id));
            }
            if (hasNoDuplicates) {
                noOutcomes.slice(1).forEach(o => deletedIds.add(o.id));
            }

            // Also normalize single Yes/No outcomes to uppercase (skip deleted ones)
            for (const outcome of outcomes) {
                if (deletedIds.has(outcome.id)) continue;

                if (/^yes$/i.test(outcome.name) && outcome.name !== 'YES') {
                    await prisma.outcome.update({
                        where: { id: outcome.id },
                        data: { name: 'YES' },
                    });
                    console.log(`   📝 Normalized "${outcome.name}" to "YES"`);
                } else if (/^no$/i.test(outcome.name) && outcome.name !== 'NO') {
                    await prisma.outcome.update({
                        where: { id: outcome.id },
                        data: { name: 'NO' },
                    });
                    console.log(`   📝 Normalized "${outcome.name}" to "NO"`);
                }
            }

            fixedCount++;
        } catch (error) {
            console.error(`   ❌ Error fixing event ${event.id}:`, error);
            errorCount++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Fixed ${fixedCount} events with duplicate outcomes`);
    if (errorCount > 0) {
        console.log(`❌ ${errorCount} events had errors`);
    }
}

main()
    .catch((e) => {
        console.error('Fatal error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
