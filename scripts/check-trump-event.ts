import { prisma } from '../lib/prisma';

async function checkEvent() {
    // Find the event
    const event = await prisma.event.findFirst({
        where: { title: { contains: 'Trump resign', mode: 'insensitive' } },
        select: { id: true, title: true }
    });

    if (!event) {
        console.log('Event not found');
        process.exit(1);
    }

    console.log('Event:', event.title, '(ID:', event.id, ')');
    console.log('');

    // Get ALL odds history for this event
    const history = await prisma.oddsHistory.findMany({
        where: { eventId: event.id },
        orderBy: { timestamp: 'asc' },
        select: { id: true, outcomeId: true, probability: true, timestamp: true },
    });

    console.log('Total data points:', history.length);
    console.log('');

    // Group by outcome
    const byOutcome = new Map<string, typeof history>();
    for (const h of history) {
        const existing = byOutcome.get(h.outcomeId) || [];
        existing.push(h);
        byOutcome.set(h.outcomeId, existing);
    }

    // Show last 20 entries per outcome
    for (const [outcomeId, points] of byOutcome.entries()) {
        console.log('Outcome:', outcomeId);
        console.log('  Total points:', points.length);
        const last20 = points.slice(-20);
        for (const h of last20) {
            console.log('  ' + h.timestamp.toISOString() + ' | ' + (h.probability * 100).toFixed(1) + '%');
        }
        console.log('');
    }

    // Find any remaining spikes within same outcome
    console.log('Checking for spikes (>30% jump within same outcome):');
    const badIds: string[] = [];

    for (const [outcomeId, points] of byOutcome.entries()) {
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const jump = Math.abs(curr.probability - prev.probability);
            if (jump > 0.30) {
                console.log('  SPIKE: ' + (prev.probability * 100).toFixed(1) + '% -> ' + (curr.probability * 100).toFixed(1) + '% at ' + curr.timestamp.toISOString());
                console.log('    ID: ' + curr.id);
                badIds.push(curr.id);
            }
        }
    }

    console.log('');
    console.log('Bad IDs to delete:', JSON.stringify(badIds));

    process.exit(0);
}
checkEvent();
