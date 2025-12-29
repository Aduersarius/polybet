
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

// Initialize Prisma with pg adapter (Prisma 7 pattern)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log('Starting Polymarket outcome creation/fix...');

    const mappings = await prisma.polymarketMarketMapping.findMany();

    console.log(`Found ${mappings.length} mappings in database.`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const m of mappings) {
        if (!m.isActive) continue;

        const eventId = m.internalEventId;

        // DEBUG logic
        if (eventId === '823006361' || eventId.includes('823006361')) {
            console.log(`\n--- DEBUG Event ${eventId} ---`);
            const ev = await prisma.event.findUnique({ where: { id: eventId } });
            console.log(`Event table record found? ${!!ev}`);
            if (!ev) {
                console.log('CRITICAL: Event record missing! Cannot create outcomes.');
                // Try to find the REAL event?
                // Maybe search by title from outcomes? "Lilo & Stitch"?
                continue;
            }

            const outcomes = await prisma.outcome.findMany({ where: { eventId } });
            console.log(`Found ${outcomes.length} existing outcomes for this event.`);
        }

        // Handle Binary Mappings
        if (m.yesTokenId && m.noTokenId) {
            // ... (Keep existing binary update logic) ...
            const yesRes = await prisma.outcome.updateMany({
                where: {
                    eventId: eventId,
                    name: { in: ['YES', 'Yes', 'yes'] },
                    polymarketOutcomeId: { not: m.yesTokenId }
                },
                data: { polymarketOutcomeId: m.yesTokenId }
            });
            if (yesRes.count > 0) updatedCount += yesRes.count;

            const noRes = await prisma.outcome.updateMany({
                where: {
                    eventId: eventId,
                    name: { in: ['NO', 'No', 'no'] },
                    polymarketOutcomeId: { not: m.noTokenId }
                },
                data: { polymarketOutcomeId: m.noTokenId }
            });
            if (noRes.count > 0) updatedCount += noRes.count;
        }

        // Handle JSON Array mappings (Create missing)
        let outcomesList: any[] = [];
        if (m.outcomeMapping) {
            if (Array.isArray(m.outcomeMapping)) {
                outcomesList = m.outcomeMapping as any[];
            } else if (typeof m.outcomeMapping === 'object' && (m.outcomeMapping as any).outcomes && Array.isArray((m.outcomeMapping as any).outcomes)) {
                outcomesList = (m.outcomeMapping as any).outcomes;
            }
        }

        if (outcomesList.length > 0) {
            for (const o of outcomesList) {
                if (!o.polymarketId || !o.name) continue;

                const existing = await prisma.outcome.findFirst({
                    where: {
                        eventId: eventId,
                        OR: [
                            { polymarketOutcomeId: o.polymarketId },
                            { name: o.name }
                        ]
                    }
                });

                if (!existing) {
                    // Ensure event exists before creating outcome
                    const checkEvent = await prisma.event.findUnique({ where: { id: eventId } });
                    if (!checkEvent) {
                        console.error(`Skipping outcome creation for ${o.name}: Event ${eventId} not found.`);
                        continue;
                    }

                    try {
                        // console.log(`Creating missing outcome for event ${eventId}: "${o.name}"`);
                        await prisma.outcome.create({
                            data: {
                                eventId: eventId,
                                name: o.name,
                                polymarketOutcomeId: o.polymarketId,
                                source: 'POLYMARKET',
                                probability: 0,
                                liquidity: 0
                            }
                        });
                        createdCount++;
                    } catch (err) {
                        console.error(`Failed to create outcome ${o.name}:`, err.message);
                    }
                } else if (existing.polymarketOutcomeId !== o.polymarketId) {
                    await prisma.outcome.update({
                        where: { id: existing.id },
                        data: { polymarketOutcomeId: o.polymarketId }
                    });
                    updatedCount++;
                }
            }
        }
    }

    console.log(`Done. Created ${createdCount}, Updated ${updatedCount}.`);
    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
