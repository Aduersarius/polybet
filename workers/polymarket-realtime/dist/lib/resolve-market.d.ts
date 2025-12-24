/**
 * Market Resolution Logic for Worker
 * Extracted from hybrid-trading.ts for standalone use
 */
interface ResolveResult {
    winnersCount: number;
    totalPayout: number;
    totalFees: number;
}
export declare function resolveMarket(eventId: string, winningOutcomeId: string): Promise<ResolveResult>;
export {};
