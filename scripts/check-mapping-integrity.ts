#!/usr/bin/env tsx

/**
 * Pre-migration check for PolymarketMarketMapping → Event relation
 * 
 * This script checks if adding the foreign key constraint will fail
 * due to orphaned mappings (mappings pointing to non-existent events).
 */

import { prisma } from '../lib/prisma';

async function checkOrphanedMappings() {
    console.log('🔍 Checking for orphaned PolymarketMarketMapping records...\n');

    try {
        // Get all mappings
        const mappings = await prisma.polymarketMarketMapping.findMany({
            select: {
                id: true,
                internalEventId: true,
                polymarketId: true,
                isActive: true,
            },
        });

        console.log(`📊 Total mappings: ${mappings.length}`);

        if (mappings.length === 0) {
            console.log('✅ No mappings found. Safe to add foreign key.\n');
            return { orphaned: [], safe: true };
        }

        // Get all event IDs
        const events = await prisma.event.findMany({
            select: { id: true },
        });

        const eventIds = new Set(events.map(e => e.id));
        console.log(`📊 Total events: ${events.size}\n`);

        // Find orphaned mappings
        const orphaned = mappings.filter(m => !eventIds.has(m.internalEventId));

        if (orphaned.length === 0) {
            console.log('✅ No orphaned mappings found. Safe to add foreign key.\n');
            return { orphaned: [], safe: true };
        }

        console.log(`❌ Found ${orphaned.length} orphaned mappings:\n`);
        orphaned.forEach(m => {
            console.log(`  - ID: ${m.id}`);
            console.log(`    Event ID: ${m.internalEventId} (MISSING)`);
            console.log(`    Polymarket ID: ${m.polymarketId}`);
            console.log(`    Active: ${m.isActive}`);
            console.log('');
        });

        console.log('⚠️  WARNING: Foreign key constraint will FAIL until these are fixed.\n');
        console.log('Options:');
        console.log('  1. Delete orphaned mappings (recommended if inactive)');
        console.log('  2. Create missing events (if they should exist)');
        console.log('  3. Update mappings to point to existing events\n');

        return { orphaned, safe: false };
    } catch (error) {
        console.error('❌ Error during check:', error);
        throw error;
    }
}

// Run the check
checkOrphanedMappings()
    .then(({ orphaned, safe }) => {
        if (safe) {
            console.log('✅ Pre-migration check PASSED. You can proceed with the migration.\n');
            process.exit(0);
        } else {
            console.log(`❌ Pre-migration check FAILED. Fix ${orphaned.length} orphaned records first.\n`);
            process.exit(1);
        }
    })
    .catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
