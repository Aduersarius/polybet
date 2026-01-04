#!/usr/bin/env node
/**
 * Script to refresh the OddsHistoryHourly materialized view
 * 
 * This can be run manually if needed:
 *   npx tsx scripts/refresh-odds-history-view.ts
 * 
 * In production, the view is refreshed automatically:
 * 1. After odds ingestion (odds-cron)
 * 2. On-demand when users query long-period charts
 */

import { refreshOddsHistoryView } from '../lib/odds-history-refresh';

async function main() {
    console.log('[Manual] Starting forced refresh...');
    const result = await refreshOddsHistoryView(true); // force=true
    console.log('[Manual] Result:', result);
    process.exit(result.success ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
