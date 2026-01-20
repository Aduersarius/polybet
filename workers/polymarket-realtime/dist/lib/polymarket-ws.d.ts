/**
 * Polymarket WebSocket Client
 * Real-time updates for sports events, markets, and odds
 *
 * Performance Optimized: Uses internal caching to avoid DB lookups on every message.
 * Integrated: Directly broadcasts to Pusher (Soketi) for instant UI updates.
 */
export interface PolymarketWSClientOptions {
    onPriceUpdate?: (tokenId: string, price: number) => Promise<void>;
    autoUpdateDb?: boolean;
}
export declare class PolymarketWebSocketClient {
    private ws;
    private reconnectTimeout;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private subscribedMarkets;
    private isConnected;
    private heartbeatInterval;
    private options;
    private mappingCache;
    constructor(options?: PolymarketWSClientOptions);
    private connect;
    private startHeartbeat;
    private stopHeartbeat;
    private attemptReconnect;
    private handleMessage;
    /**
     * Main handler for real-time market updates
     */
    private handleMarketUpdate;
    subscribe(assetId: string): void;
    private resubscribeToMarkets;
    subscribeToAllActiveEvents(): Promise<void>;
    /**
     * Alias for backwards compatibility
     */
    subscribeToAllSportsEvents(): Promise<void>;
    setupDynamicSubscription(): Promise<void>;
}
export declare function getPolymarketWSClient(): PolymarketWebSocketClient;
