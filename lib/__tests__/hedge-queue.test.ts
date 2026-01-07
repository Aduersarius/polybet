import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HedgeQueue, HedgeRequest } from '../hedge-queue';

// Mock polymarket trading
vi.mock('../polymarket-trading', () => ({
    polymarketTrading: {
        placeMarketOrder: vi.fn().mockResolvedValue({ orderId: 'mock-order-123' }),
    },
}));

// Mock circuit breaker
vi.mock('../circuit-breaker', () => ({
    polymarketCircuit: {
        isAllowed: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockImplementation((fn) => fn()),
        onFailure: vi.fn(),
    },
    CircuitOpenError: class extends Error {
        constructor(msg: string) { super(msg); this.name = 'CircuitOpenError'; }
    },
}));

describe('HedgeQueue', () => {
    let queue: HedgeQueue;

    beforeEach(() => {
        queue = new HedgeQueue();
        vi.clearAllMocks();
    });

    afterEach(() => {
        queue.clear();
    });

    const createRequest = (partial: Partial<HedgeRequest> = {}): HedgeRequest => ({
        marketId: 'market-1',
        conditionId: 'condition-1',
        tokenId: 'token-1',
        side: 'BUY',
        size: 100,
        userOrderId: 'order-1',
        hedgePrice: 0.5,
        ...partial,
    });

    describe('Single Request', () => {
        it('processes single request successfully', async () => {
            const request = createRequest();

            const result = await queue.enqueue(request);

            expect(result.success).toBe(true);
            expect(result.orderId).toBe('mock-order-123');
        });
    });

    describe('Batching', () => {
        it('aggregates same-market same-direction requests', async () => {
            const { polymarketTrading } = await import('../polymarket-trading');

            const requests = [
                createRequest({ size: 100, userOrderId: 'order-1' }),
                createRequest({ size: 50, userOrderId: 'order-2' }),
                createRequest({ size: 75, userOrderId: 'order-3' }),
            ];

            // Enqueue all at once
            const results = await Promise.all(requests.map(r => queue.enqueue(r)));

            // All should succeed
            results.forEach(r => {
                expect(r.success).toBe(true);
                expect(r.orderId).toBe('mock-order-123');
            });

            // Should have called placeMarketOrder only once with aggregated size
            expect(polymarketTrading.placeMarketOrder).toHaveBeenCalledTimes(1);
            expect(polymarketTrading.placeMarketOrder).toHaveBeenCalledWith(
                'market-1',
                'condition-1',
                'token-1',
                'BUY',
                225 // 100 + 50 + 75
            );
        });

        it('separates different directions into different groups', async () => {
            const { polymarketTrading } = await import('../polymarket-trading');

            const requests = [
                createRequest({ side: 'BUY', size: 100, userOrderId: 'buy-1' }),
                createRequest({ side: 'SELL', size: 50, userOrderId: 'sell-1' }),
            ];

            const results = await Promise.all(requests.map(r => queue.enqueue(r)));

            results.forEach(r => expect(r.success).toBe(true));

            // Should have called placeMarketOrder twice (one for each direction)
            expect(polymarketTrading.placeMarketOrder).toHaveBeenCalledTimes(2);
        });

        it('separates different tokens into different groups', async () => {
            const { polymarketTrading } = await import('../polymarket-trading');

            const requests = [
                createRequest({ tokenId: 'token-1', size: 100, userOrderId: 'order-1' }),
                createRequest({ tokenId: 'token-2', size: 50, userOrderId: 'order-2' }),
            ];

            const results = await Promise.all(requests.map(r => queue.enqueue(r)));

            results.forEach(r => expect(r.success).toBe(true));

            // Should have called placeMarketOrder twice (one for each token)
            expect(polymarketTrading.placeMarketOrder).toHaveBeenCalledTimes(2);
        });
    });

    describe('Stats', () => {
        it('returns correct queue statistics', () => {
            const stats = queue.getStats();

            expect(stats).toEqual({
                queueLength: 0,
                processing: false,
                oldestAge: 0,
            });
        });
    });

    describe('Clear', () => {
        it('rejects all pending requests on clear', async () => {
            // This test is timing-sensitive - we need to clear before batch processes
            const request = createRequest();

            // Don't await - we want to clear before it processes
            const promise = queue.enqueue(request);
            queue.clear();

            await expect(promise).rejects.toThrow('Queue cleared');
        });
    });
});
