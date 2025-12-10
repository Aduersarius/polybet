import { prisma } from '../lib/prisma';
import { placeHybridOrder, resolveMarket } from '../lib/hybrid-trading';

const AMM_BOT_ID = 'cminhk477000002s8jld69y1f';
const TREASURY_ID = 'cminhk477000002s8jld69y1f'; // Same for now

async function verifyFinancials() {
    console.log('💰 Verifying Financial Flows...');

    // 1. Setup Test Event
    const event = await prisma.event.create({
        data: {
            title: 'Financial Test Event',
            description: 'Testing spread and commission',
            resolutionDate: new Date(),
            creatorId: AMM_BOT_ID,
            type: 'BINARY',
            liquidityParameter: 1000,
            qYes: 0,
            qNo: 0,
            status: 'ACTIVE'
        }
    });
    console.log('Created test event:', event.id);

    // 2. Test Spread Collection
    console.log('\n--- Testing Spread Collection ---');

    // Get initial AMM balance
    const initialAmmBal = await prisma.balance.findFirst({
        where: { userId: AMM_BOT_ID, tokenSymbol: 'TUSD', eventId: null }
    });
    const startAmmUsd = initialAmmBal?.amount.toNumber() || 0;
    console.log('Initial AMM USD:', startAmmUsd);

    // Place trade: Buy $100 of YES
    // Spread is 2%. So spreadAmount = 100 * (0.02/1.02) ≈ 1.96
    // Cost to spend = 98.04
    // AMM should receive $100 TUSD.
    // AMM should pay out shares worth roughly $98.04 (at 0.5 price -> ~196 shares)
    // Net effect on AMM TUSD should be +$100.
    // But we want to verify the "Spread" was conceptually separated?
    // The code adds `costToSpend` and `spreadAmount` separately to AMM balance.
    // So total TUSD increase = amount.

    await placeHybridOrder(AMM_BOT_ID, event.id, 'buy', 'YES', 100);

    const midAmmBal = await prisma.balance.findFirst({
        where: { userId: AMM_BOT_ID, tokenSymbol: 'TUSD', eventId: null }
    });
    const midAmmUsd = midAmmBal?.amount.toNumber() || 0;
    console.log('Post-Trade AMM USD:', midAmmUsd);
    console.log('Difference:', midAmmUsd - startAmmUsd);

    if (Math.abs((midAmmUsd - startAmmUsd) - 100) < 0.01) {
        console.log('✅ AMM received full amount (Cost + Spread)');
    } else {
        console.error('❌ AMM balance mismatch');
    }

    // 3. Test Commission on Resolution
    console.log('\n--- Testing Commission Collection ---');

    // User holds YES shares now.
    // Let's resolve to YES.
    // User should get Payout = Shares * $1.
    // Fee = Payout * 2%.
    // Net = Payout - Fee.
    // Treasury should get Fee.

    const userSharesBal = await prisma.balance.findFirst({
        where: { userId: AMM_BOT_ID, tokenSymbol: `YES_${event.id}` }
    });
    const shares = userSharesBal?.amount.toNumber() || 0;
    console.log('User Shares:', shares);

    const expectedPayout = shares * 1.00;
    const expectedFee = expectedPayout * 0.02;
    const expectedNet = expectedPayout - expectedFee;

    console.log(`Expected Payout: $${expectedPayout.toFixed(2)}`);
    console.log(`Expected Fee: $${expectedFee.toFixed(2)}`);
    console.log(`Expected Net: $${expectedNet.toFixed(2)}`);

    const result = await resolveMarket(event.id, 'YES');
    console.log('Resolution Result:', result);

    const finalAmmBal = await prisma.balance.findFirst({
        where: { userId: AMM_BOT_ID, tokenSymbol: 'TUSD', eventId: null }
    });
    const finalAmmUsd = finalAmmBal?.amount || 0;

    console.log('Final User USD:', finalAmmUsd);
    // Since User = Treasury in this test case, the logic is a bit circular but:
    // User paid $100.
    // User got back Net Payout.
    // Treasury got Fee.
    // Total Change = -100 + Net + Fee = -100 + Payout.
    // Payout should be roughly equal to Cost ($98.04) if price didn't move much?
    // Actually price moved from 0.5 to something higher.
    // So Payout > Cost.

    // Let's just check the returned values from resolveMarket
    if (Math.abs(result.totalFees - expectedFee) < 0.01) {
        console.log('✅ Commission calculated correctly');
    } else {
        console.error('❌ Commission mismatch');
    }
}

verifyFinancials()
    .catch(console.error)
    .finally(async () => {
        // Cleanup?
        await prisma.$disconnect();
    });
