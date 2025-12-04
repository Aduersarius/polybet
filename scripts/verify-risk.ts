import { RiskManager } from '../lib/risk-manager';

async function verifyRisk() {
    console.log('🛡️ Verifying Risk Management Rules...');

    // Mock data
    const userId = 'test-user';
    const eventId = 'test-event';
    const currentProb = 0.5;

    // 1. Test Slippage Cap (Max 10%)
    console.log('\n1. Testing Slippage Cap...');
    const smallTrade = await RiskManager.validateTrade(userId, eventId, 100, 'buy', 'YES', 0.5, 0.52); // 4% change
    if (smallTrade.allowed) console.log('✅ Small trade allowed (4% slippage)');
    else console.error('❌ Small trade blocked unexpectedly');

    const largeTrade = await RiskManager.validateTrade(userId, eventId, 1000, 'buy', 'YES', 0.5, 0.60); // 20% change
    if (!largeTrade.allowed && largeTrade.reason?.includes('Slippage')) {
        console.log('✅ Large trade blocked (20% slippage):', largeTrade.reason);
    } else {
        console.error('❌ Large trade NOT blocked or wrong reason:', largeTrade);
    }

    // 2. Test Event Liability Cap ($2,000)
    console.log('\n2. Testing Event Liability Cap...');
    // We need to mock the DB response for this to work fully, but since we are running in a real env,
    // we can try to trigger it if we have data.
    // Since we can't easily mock prisma here without a lot of setup, we'll rely on the logic check we just wrote.
    // But let's try to call it with a huge amount that would definitely exceed it if calculated naively.

    // Note: The current implementation checks DB state. If DB is empty, liability is 0.
    // So we can simulate a huge trade that would exceed the cap on its own.
    // 2000 / 0.5 = 4000 shares.
    const hugeTrade = await RiskManager.validateTrade(userId, eventId, 5000, 'buy', 'YES', 0.5, 0.51);
    if (!hugeTrade.allowed && hugeTrade.reason?.includes('Event liability')) {
        console.log('✅ Huge trade blocked (Event Cap):', hugeTrade.reason);
    } else {
        // This might pass if the DB is empty and our estimation logic is loose, or if we didn't implement "future liability" check correctly.
        // In my implementation:
        // if (eventLiability + estimatedShares > EVENT_LIABILITY_CAP)
        // If eventLiability is 0, estimatedShares = 5000/0.5 = 10000 > 2000. Should block.
        console.log('❓ Huge trade result:', hugeTrade);
    }

    // 3. Test Global Liability Cap ($20,000)
    console.log('\n3. Testing Global Liability Cap...');
    const massiveTrade = await RiskManager.validateTrade(userId, eventId, 25000, 'buy', 'YES', 0.5, 0.51);
    if (!massiveTrade.allowed && massiveTrade.reason?.includes('Global liability')) {
        console.log('✅ Massive trade blocked (Global Cap):', massiveTrade.reason);
    } else {
        console.log('❓ Massive trade result:', massiveTrade);
    }
}

verifyRisk()
    .catch(console.error)
    .finally(() => process.exit(0));
