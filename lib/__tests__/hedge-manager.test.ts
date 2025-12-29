import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HedgeManager } from '../hedge-manager';
import { prisma } from '../prisma';

// Mock prisma
vi.mock('../prisma', () => ({
    prisma: {
        hedgePosition: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        hedgeConfig: {
            findMany: vi.fn(),
        },
    },
}));

// Mock polymarket trading
vi.mock('../polymarket-trading', () => ({
    polymarketTrading: {
        isEnabled: () => true,
    },
    estimatePolymarketFees: (size: number, price: number) => size * price * 0.02, // 2% fees
}));

describe('HedgeManager Settlement Logic', () => {
    let hedgeManager: HedgeManager;

    beforeEach(() => {
        hedgeManager = new HedgeManager();
        vi.clearAllMocks();
    });

    describe('BUY Hedge Settlement', () => {
        it('calculates correct P/L when outcome WINS', async () => {
            // Setup: User buys 100 shares at $0.60, we hedge by buying 100 shares at $0.58
            const mockHedgePosition = {
                id: 'hedge123',
                side: 'BUY',
                amount: 100,
                userPrice: 0.60,
                hedgePrice: 0.58,
                spreadCaptured: 2.0, // (0.60 - 0.58) * 100 = $2
                polymarketFees: 1.16, // 0.58 * 100 * 0.02 = $1.16
                gasCost: 0,
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            // Act: Settle when YES wins
            const result = await hedgeManager.settleHedgePosition('hedge123', 'outcome-yes');

            // Assert:
            // Polymarket P/L: (1.00 - 0.58) * 100 = +$42
            // User liability: -1.00 * 100 = -$100 (we owe user)
            // Settlement P/L: $42 - $100 = -$58
            // Total P/L: $2 (spread) - $58 (settlement) - $1.16 (fees) = -$57.16

            // For a perfect hedge, we expect roughly -$1.16 (just the fees)
            // The settlement should be near zero since both sides offset
            expect(result.settled).toBe(true);
            expect(result.pnl).toBeCloseTo(2.0 - 1.16, 2); // Spread - fees ≈ $0.84

            // Verify the update was called with correct values
            const updateCall = vi.mocked(prisma.hedgePosition.update).mock.calls[0][0];
            expect(updateCall.data.status).toBe('closed');
            expect(updateCall.data.netProfit).toBeCloseTo(0.84, 2);
        });

        it('calculates correct P/L when outcome LOSES', async () => {
            // Setup: Same position but outcome loses
            const mockHedgePosition = {
                id: 'hedge123',
                side: 'BUY',
                amount: 100,
                userPrice: 0.60,
                hedgePrice: 0.58,
                spreadCaptured: 2.0,
                polymarketFees: 1.16,
                gasCost: 0,
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            // Act: Settle when NO wins (YES loses)
            const result = await hedgeManager.settleHedgePosition('hedge123', 'outcome-no');

            // Assert:
            // Polymarket P/L: -0.58 * 100 = -$58 (we lose our stake)
            // User liability: 0 (user gets nothing)
            // Settlement P/L: -$58 + $0 = -$58
            // Total P/L: $2 (spread) - $58 (settlement) - $1.16 (fees) = -$57.16

            // Wait, this doesn't seem right for a hedge...
            // Actually the settlement P/L calculation needs review
            expect(result.settled).toBe(true);
            expect(result.pnl).toBeCloseTo(0.84, 2); // Should be spread - fees
        });
    });

    describe('SELL Hedge Settlement', () => {
        it('calculates correct P/L when outcome WINS', async () => {
            // Setup: User sells 100 shares at $0.60, we hedge by selling 100 shares at $0.62
            const mockHedgePosition = {
                id: 'hedge456',
                side: 'SELL',
                amount: 100,
                userPrice: 0.60,
                hedgePrice: 0.62,
                spreadCaptured: 2.0, // (0.62 - 0.60) * 100 = $2
                polymarketFees: 1.24, // 0.62 * 100 * 0.02 = $1.24
                gasCost: 0,
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            // Act: Settle when YES wins
            const result = await hedgeManager.settleHedgePosition('hedge456', 'outcome-yes');

            // Assert: Total should be spread - fees
            expect(result.settled).toBe(true);
            expect(result.pnl).toBeCloseTo(0.76, 2); // $2 - $1.24
        });

        it('calculates correct P/L when outcome LOSES', async () => {
            // Setup: Same SELL position
            const mockHedgePosition = {
                id: 'hedge456',
                side: 'SELL',
                amount: 100,
                userPrice: 0.60,
                hedgePrice: 0.62,
                spreadCaptured: 2.0,
                polymarketFees: 1.24,
                gasCost: 0,
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            // Act: Settle when NO wins (YES loses)
            const result = await hedgeManager.settleHedgePosition('hedge456', 'outcome-no');

            // Assert: Total should be spread - fees
            expect(result.settled).toBe(true);
            expect(result.pnl).toBeCloseTo(0.76, 2);
        });
    });

    describe('Edge Cases', () => {
        it('handles hedgePrice = 0.01 (minimum)', async () => {
            const mockHedgePosition = {
                id: 'hedge789',
                side: 'BUY',
                amount: 100,
                userPrice: 0.03,
                hedgePrice: 0.01,
                spreadCaptured: 2.0,
                polymarketFees: 0.02,
                gasCost: 0,
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            const result = await hedgeManager.settleHedgePosition('hedge789', 'outcome-yes');

            expect(result.settled).toBe(true);
            expect(result.pnl).toBeDefined();
            expect(isNaN(result.pnl)).toBe(false);
        });

        it('handles hedgePrice = 0.99 (maximum)', async () => {
            const mockHedgePosition = {
                id: 'hedge999',
                side: 'BUY',
                amount: 100,
                userPrice: 0.97,
                hedgePrice: 0.99,
                spreadCaptured: -2.0, // Negative spread (loss)
                polymarketFees: 1.98,
                gasCost: 0,
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            const result = await hedgeManager.settleHedgePosition('hedge999', 'outcome-yes');

            expect(result.settled).toBe(true);
            expect(result.pnl).toBeDefined();
        });

        it('handles already closed position', async () => {
            const mockHedgePosition = {
                id: 'hedge-closed',
                status: 'closed',
                netProfit: 5.0,
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);

            const result = await hedgeManager.settleHedgePosition('hedge-closed', 'outcome-yes');

            expect(result.settled).toBe(true);
            expect(result.pnl).toBe(5.0);
            expect(prisma.hedgePosition.update).not.toHaveBeenCalled();
        });

        it('handles missing hedge position', async () => {
            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(null);

            const result = await hedgeManager.settleHedgePosition('nonexistent', 'outcome-yes');

            expect(result.settled).toBe(false);
            expect(result.pnl).toBe(0);
            expect(result.error).toBe('Hedge position not found');
        });

        it('includes gas costs in total fees', async () => {
            const mockHedgePosition = {
                id: 'hedge-gas',
                side: 'BUY',
                amount: 100,
                userPrice: 0.60,
                hedgePrice: 0.58,
                spreadCaptured: 2.0,
                polymarketFees: 1.16,
                gasCost: 0.50, // Add gas cost
                status: 'hedged',
                userOrder: {
                    outcomeId: 'outcome-yes',
                    option: null,
                },
                metadata: {},
            };

            vi.mocked(prisma.hedgePosition.findUnique).mockResolvedValue(mockHedgePosition as any);
            vi.mocked(prisma.hedgePosition.update).mockResolvedValue(mockHedgePosition as any);

            const result = await hedgeManager.settleHedgePosition('hedge-gas', 'outcome-yes');

            // Total P/L should subtract both fees and gas
            // $2 (spread) - $1.16 (fees) - $0.50 (gas) = $0.34
            expect(result.settled).toBe(true);
            expect(result.pnl).toBeCloseTo(0.34, 2);
        });
    });
});
