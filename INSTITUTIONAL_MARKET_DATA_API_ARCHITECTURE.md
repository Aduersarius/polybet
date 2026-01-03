# Institutional Market Data APIs Architecture Design

## Overview

This document outlines the architecture for enhanced market data APIs with historical data support for institutional liquidity providers on the Pariflow platform. The system provides real-time and historical market data optimized for algorithmic trading systems.

**Important Notes:**
- This design does NOT modify existing orderbook or AMM trading logic
- No changes to current user experience or existing APIs
- Designed for future integration with external liquidity providers
- All new APIs are under `/api/institutional/market-data/` namespace

## 1. API Structure and Endpoints Overview

### Base URL
```
/api/institutional/market-data/
```

### Authentication
All endpoints require API key authentication via `X-API-Key` header.

### Rate Limiting
- 1000 requests per minute per API key
- Burst allowance of 100 requests

### Endpoints

#### Trades API
```
GET /api/institutional/market-data/trades
```
Query historical trade data with filtering and pagination.

**Parameters:**
- `eventId` (required): Event identifier
- `outcomeId` (optional): Specific outcome for multiple events
- `option` (optional): 'YES' or 'NO' for binary events
- `startTime` (optional): ISO 8601 timestamp
- `endTime` (optional): ISO 8601 timestamp
- `limit` (optional): Max 1000, default 100
- `offset` (optional): Pagination offset
- `sort` (optional): 'asc' or 'desc' by timestamp

#### OHLC API
```
GET /api/institutional/market-data/ohlc
```
Get Open, High, Low, Close price data aggregated by time intervals.

**Parameters:**
- `eventId` (required): Event identifier
- `outcomeId` (optional): Specific outcome
- `option` (optional): 'YES' or 'NO'
- `interval` (required): '1m', '5m', '15m', '1h', '4h', '1d'
- `startTime` (optional): ISO 8601 timestamp
- `endTime` (optional): ISO 8601 timestamp
- `limit` (optional): Max 1000, default 100

#### Order Book API
```
GET /api/institutional/market-data/orderbook
```
Get current order book snapshot with depth.

**Parameters:**
- `eventId` (required): Event identifier
- `outcomeId` (optional): Specific outcome
- `option` (optional): 'YES' or 'NO'
- `depth` (optional): Number of price levels, max 50, default 20

#### Market Statistics API
```
GET /api/institutional/market-data/statistics
```
Get aggregated market statistics.

**Parameters:**
- `eventId` (required): Event identifier
- `outcomeId` (optional): Specific outcome
- `option` (optional): 'YES' or 'NO'
- `period` (optional): '1h', '24h', '7d', '30d'

#### Real-time WebSocket Feed
```
WebSocket: /api/institutional/market-data/ws
```
Real-time updates for trades, order book changes, and statistics.

**Subscription Messages:**
```json
{
  "action": "subscribe",
  "channels": ["trades", "orderbook", "statistics"],
  "eventId": "event-uuid",
  "outcomeId": "outcome-uuid"
}
```

#### Data Export API
```
GET /api/institutional/market-data/export
```
Export historical data in various formats.

**Parameters:**
- `type` (required): 'trades', 'ohlc', 'statistics'
- `eventId` (required): Event identifier
- `format` (required): 'json', 'csv', 'parquet'
- `startTime` (required): ISO 8601 timestamp
- `endTime` (required): ISO 8601 timestamp
- Additional filters as per data type

## 2. Data Models

### Trade Data Model
```typescript
interface Trade {
  id: string;
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  side: 'buy' | 'sell';
  price: number; // 0.01 to 0.99
  amount: number;
  volume: number; // price * amount
  timestamp: string; // ISO 8601
  isAmmTrade: boolean;
  makerUserId?: string;
  takerUserId: string;
  orderId?: string;
}
```

### OHLC Data Model
```typescript
interface OHLCBar {
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  timestamp: string; // ISO 8601, start of interval
  interval: string; // '1m', '5m', etc.
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Total volume in interval
  trades: number; // Number of trades in interval
}
```

### Order Book Data Model
```typescript
interface OrderBook {
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  timestamp: string; // ISO 8601
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number; // ask - bid
  midPrice: number; // (bestBid + bestAsk) / 2
}

interface OrderBookLevel {
  price: number;
  amount: number; // Total amount at this price
  orderCount: number; // Number of orders at this price
}
```

### Market Statistics Data Model
```typescript
interface MarketStatistics {
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  period: string; // '1h', '24h', etc.
  timestamp: string; // ISO 8601
  volume: number; // Total volume
  trades: number; // Total trade count
  high: number; // Highest price
  low: number; // Lowest price
  open: number; // Opening price
  close: number; // Closing price
  vwap: number; // Volume Weighted Average Price
  volatility: number; // Price volatility (standard deviation)
  liquidity: number; // Available liquidity (sum of order amounts)
}
```

## 3. Authentication and Authorization

### API Key Authentication
- Uses existing `InstitutionalAccount` and `ApiKey` models
- API keys are hashed and stored securely
- Keys have permissions: `["read", "trade", "admin"]`
- Market data APIs require `read` permission

### Rate Limiting
- Implemented using Redis sorted sets
- Sliding window algorithm
- Configurable limits per account type
- Burst handling with queue

### Request Validation
- API key validation on every request
- Account status checks (active/inactive)
- Volume limits validation for trading APIs
- Input sanitization and validation

## 4. Caching and Aggregation Strategies

### Redis Caching Strategy
- **Trade Data**: Cache recent trades (last 24h) with 30s TTL
- **OHLC Data**: Cache aggregated bars with TTL based on interval (1m: 30s, 1h: 5m, 1d: 1h)
- **Order Book**: Cache with 2s TTL for real-time updates
- **Statistics**: Cache with 1m TTL

### Aggregation Pipeline
- **Real-time Aggregation**: Use Redis streams for trade events
- **Batch Aggregation**: Background jobs for historical OHLC calculation
- **Incremental Updates**: Update statistics incrementally on new trades

### Database Optimization
- Partitioning by event and time for large datasets
- Indexes on timestamp, eventId, outcomeId
- Materialized views for common aggregations
- Archive old data to separate tables

### Performance Optimizations
- Connection pooling for database
- Prepared statements for common queries
- Pagination with cursor-based navigation
- Compression for large responses

## 5. Data Export Formats and Mechanisms

### Supported Formats
- **JSON**: Standard API response format
- **CSV**: Comma-separated values for spreadsheet analysis
- **Parquet**: Columnar format for big data processing

### Export Mechanisms
- **Streaming**: Large datasets streamed to client
- **Asynchronous**: Background job for very large exports
- **Compression**: Gzip compression for all formats
- **Pagination**: Chunked downloads for large datasets

### Export API Response
```typescript
interface ExportResponse {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  recordCount: number;
  fileSize: number;
}
```

## 6. Integration Points with Existing System

### Database Integration
- Leverages existing `MarketActivity`, `Order`, `OrderExecution` tables
- Extends with new aggregated data tables if needed
- Maintains data consistency with existing trading engine

### Authentication Integration
- Uses existing `requireApiKeyAuth` middleware
- Integrates with institutional account management
- Shares rate limiting infrastructure

### WebSocket Integration
- Extends existing WebSocket server for real-time feeds
- Room-based subscriptions for market data
- Event-driven updates from trading engine

### Trading Engine Integration
- Subscribes to trade events from hybrid trading system
- Updates cached data on order book changes
- Maintains consistency with AMM pricing

### Monitoring Integration
- Logs API usage for analytics
- Integrates with existing error tracking
- Performance metrics collection

## 7. Scalability and Performance Considerations

### Horizontal Scaling
- Stateless API design for load balancing
- Redis cluster for distributed caching
- Database read replicas for query scaling

### Database Scaling
- Time-based partitioning for historical data
- Index optimization for query patterns
- Connection pooling and query optimization

### Caching Strategy
- Multi-level caching (Redis + application cache)
- Cache warming for popular markets
- Intelligent cache invalidation on data changes

### Real-time Performance
- WebSocket connection pooling
- Efficient serialization (MessagePack for WS)
- Batched updates for high-frequency data

## 8. Error Handling and Reliability

### Error Responses
```typescript
interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
  timestamp: string;
}
```

### Circuit Breakers
- Database connection failures
- Redis unavailability
- External service dependencies

### Data Consistency
- Eventual consistency for cached data
- Transactional updates for critical operations
- Reconciliation jobs for data integrity

## 9. Monitoring and Analytics

### Metrics Collection
- API response times and throughput
- Cache hit/miss ratios
- Database query performance
- WebSocket connection counts

### Logging
- Structured logging for all API calls
- Error tracking with context
- Audit logs for sensitive operations

### Alerts
- Performance degradation alerts
- Data inconsistency detection
- Rate limit violations

## 10. Implementation Roadmap

### Phase 1: Core APIs
- Trades API with basic filtering
- Order Book API (enhanced from existing)
- Basic authentication and rate limiting

### Phase 2: Historical Data
- OHLC aggregation and API
- Extended time range support
- Data export functionality

### Phase 3: Advanced Features
- Real-time WebSocket feeds
- Market statistics API
- Performance optimizations

### Phase 4: Production Readiness
- Comprehensive testing
- Monitoring and alerting
- Documentation and client libraries

## 11. Security Considerations

### Data Privacy
- No sensitive user data in market data APIs
- Aggregated data only
- Rate limiting to prevent data scraping

### API Security
- API key rotation requirements
- Request signing for high-security endpoints
- IP whitelisting for institutional accounts

### Infrastructure Security
- Encrypted data in transit and at rest
- Secure Redis configuration
- Database access controls

## 12. External Liquidity Provider Integration

### Future Integration Points
The APIs are designed to support external liquidity providers through:

#### Market Data Feeds
- **Comprehensive Data**: All necessary market data for LP decision making
- **Real-time Updates**: WebSocket feeds for low-latency trading signals
- **Historical Context**: OHLC and trade history for strategy development
- **Order Book Depth**: Full depth for sophisticated trading algorithms

#### Integration Architecture
```typescript
interface LiquidityProviderIntegration {
  // Market data consumption
  marketDataFeeds: {
    trades: WebSocketFeed;
    orderbook: WebSocketFeed;
    statistics: RestApi;
  };

  // Trading integration (future)
  tradingApi: {
    placeOrder: Function;
    cancelOrder: Function;
    getPositions: Function;
  };

  // Settlement and reconciliation
  settlementApi: {
    getTrades: Function;
    confirmSettlement: Function;
  };
}
```

#### Data Format Standards
- **FIX Protocol Support**: Industry standard for institutional trading
- **Custom JSON APIs**: REST and WebSocket for flexibility
- **Real-time Synchronization**: Sub-millisecond latency requirements

#### Security for External LPs
- **Mutual TLS**: Certificate-based authentication
- **IP Whitelisting**: Network-level access control
- **API Key Management**: Secure credential distribution
- **Audit Logging**: Complete transaction traceability

## 13. Testing Strategy

### Unit Tests
- Data transformation logic
- API validation
- Caching mechanisms

### Integration Tests
- End-to-end API flows
- Database interactions
- WebSocket functionality

### Performance Tests
- Load testing with realistic data volumes
- Latency measurements
- Scalability validation

### Algorithmic Trading Simulation
- Test with simulated trading bots
- Validate data accuracy and timeliness
- Stress test real-time feeds

### External LP Simulation
- Mock external LP connections
- Test data feed reliability
- Validate integration points

---

This architecture provides a comprehensive, scalable solution for institutional market data access while maintaining compatibility with the existing Pariflow trading platform.