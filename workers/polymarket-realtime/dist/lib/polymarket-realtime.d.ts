/**
 * Polymarket Real-Time Data Client
 *
 * Official wrapper around @polymarket/real-time-data-client for production use.
 * Handles trade feeds, price updates, and market data streams.
 *
 * Topics available:
 * - "activity": Trade executions (type: "trades")
 * - "comments": Market comments
 * - "crypto_prices": Crypto price feeds
 */
export interface PolymarketRealtimeClientOptions {
    onPriceUpdate?: (tokenId: string, price: number) => Promise<void>;
    autoUpdateDb?: boolean;
}
export declare class PolymarketRealtimeClient {
    private client;
    private options;
    private mappingCache;
    private circuitState;
    private failureCount;
    private lastFailureTime;
    private readonly FAILURE_THRESHOLD;
    private readonly RESET_TIMEOUT;
    constructor(options?: PolymarketRealtimeClientOptions);
    connect(): this;
    private handleFailure;
    private handleMessage;
    private handleMarketUpdate;
    private subscribeToActiveMarkets;
    private startPolling;
    disconnect(): void;
}
export declare function getPolymarketRealtimeClient(): PolymarketRealtimeClient;
