import { getCryptoService } from '../../lib/crypto-service';

async function testWithdrawalIdempotency() {
    const userId = 'test-user-id'; // Use a test user ID
    const amount = 10;
    const address = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'; // Test address
    const currency = 'USDC';
    const idempotencyKey = 'test-idempotency-key-123';

    console.log('Testing withdrawal idempotency...');

    const service = getCryptoService();

    try {
        // First request should succeed
        console.log('Making first withdrawal request...');
        await service.requestWithdrawal(userId, amount, address, currency, idempotencyKey);
        console.log('✅ First withdrawal request succeeded');
    } catch (error) {
        console.log('❌ First withdrawal request failed:', (error as Error).message);
        return;
    }

    try {
        // Second request with same idempotencyKey should fail
        console.log('Making second withdrawal request with same idempotencyKey...');
        await service.requestWithdrawal(userId, amount, address, currency, idempotencyKey);
        console.log('❌ Second withdrawal request should have failed but succeeded');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            console.log('✅ Second withdrawal request correctly failed with duplicate error');
        } else {
            console.log('❌ Second withdrawal request failed with unexpected error:', (error as Error).message);
        }
    }

    // Test without idempotencyKey (should succeed multiple times, but balance might be insufficient)
    try {
        console.log('Making withdrawal request without idempotencyKey...');
        await service.requestWithdrawal(userId, amount, address, currency);
        console.log('✅ Withdrawal request without idempotencyKey succeeded');
    } catch (error) {
        console.log('Withdrawal request without idempotencyKey failed:', (error as Error).message);
    }
}

testWithdrawalIdempotency().catch(console.error);