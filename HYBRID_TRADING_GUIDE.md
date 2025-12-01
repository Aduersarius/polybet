# Hybrid AMM + Orderbook Trading System

## Overview

The PolyBet platform now features a sophisticated hybrid trading system that combines the benefits of Automated Market Making (AMM) with traditional order book functionality. This system provides both market makers (AMM bot) and traders (limit orders) with optimal trading experiences.

## Key Features

### 🔄 Hybrid Trading Engine
- **AMM Liquidity**: Automated Market Maker provides instant liquidity at transparent prices
- **Order Book**: Traditional limit order matching for price discovery
- **Smart Routing**: Automatically matches orders against both AMM and other traders
- **Real-time Updates**: WebSocket-powered live price and order book updates

### 💰 AMM Bot (Liquidity Provider)
- **Constant Liquidity**: Provides $100k starting liquidity per market
- **Dynamic Pricing**: Uses LMSR (Logarithmic Market Scoring Rule) for fair pricing
- **Spread Trading**: Maintains 1% spread around fair market price
- **Automatic Rebalancing**: Continuously updates prices based on market activity

### 📈 Order Book Features
- **Limit Orders**: Set specific prices for buying/selling
- **Market Orders**: Execute immediately at best available price
- **Order Matching**: Advanced matching engine with price-time priority
- **Real-time Updates**: Live order book updates via WebSocket

## Architecture

### Database Schema

```sql
-- Orders table for limit order management
CREATE TABLE "Order" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "side" TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    "option" TEXT NOT NULL CHECK (option IN ('YES', 'NO')),
    "price" DOUBLE PRECISION NOT NULL CHECK (price >= 0.01 AND price <= 0.99),
    "amount" DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    "amountFilled" DOUBLE PRECISION DEFAULT 0.0,
    "status" TEXT DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trades table for transaction history
CREATE TABLE "Trade" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "makerOrderId" TEXT,
    "makerUserId" TEXT,
    "side" TEXT NOT NULL,
    "option" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isAmmTrade" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User balances for different token types
CREATE TABLE "Balance" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,  -- 'TUSD' for USD, 'YES_{eventId}'/'NO_{eventId}' for outcome tokens
    "eventId" TEXT,
    "amount" DOUBLE PRECISION DEFAULT 0.0,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Core Components

1. **Hybrid Trading Engine** (`lib/hybrid-trading.ts`)
   - Order matching logic
   - AMM integration
   - Balance management
   - Real-time price calculations

2. **WebSocket Server** (`lib/ws-server.ts`)
   - Real-time updates
   - Room-based subscriptions
   - Event-driven architecture

3. **API Endpoints**
   - `POST /api/hybrid-trading` - Place orders
   - `GET /api/hybrid-trading?eventId&option` - Get order book

## How It Works

### Order Flow

1. **User Places Order**
   - Select market/limit order type
   - Choose side (buy/sell) and outcome (YES/NO)
   - Set amount and (optionally) limit price

2. **Smart Order Matching**
   - **Limit Orders**: First match against existing orders in order book
   - **Market Orders**: Execute immediately against AMM
   - **Unfilled Amounts**: Route remaining to AMM for instant execution

3. **AMM Integration**
   - Uses LMSR formula for fair pricing
   - Automatically adjusts odds based on trading activity
   - Provides liquidity for immediate execution

4. **Real-time Updates**
   - WebSocket broadcasts trade updates
   - Order book refreshes automatically
   - Price feeds update in real-time

### AMM Bot Operation

The AMM bot continuously:
1. **Monitors Market Activity**: Tracks trades and price changes
2. **Updates Prices**: Recalculates fair value using LMSR
3. **Places Orders**: Maintains buy/sell orders with 1% spread
4. **Provides Liquidity**: Ensures traders can always execute

## API Usage

### Place Hybrid Order

```javascript
// Market Order
POST /api/hybrid-trading
{
  "eventId": "bitcoin-100k-2025",
  "side": "buy",
  "option": "YES", 
  "amount": 100,
  "orderType": "market"
}

// Limit Order
POST /api/hybrid-trading
{
  "eventId": "bitcoin-100k-2025",
  "side": "buy",
  "option": "YES",
  "amount": 100,
  "price": 0.65,  // $0.65 per token
  "orderType": "limit"
}
```

### Get Order Book

```javascript
// Get YES tokens order book
GET /api/hybrid-trading?eventId=bitcoin-100k-2025&option=YES

// Response
{
  "bids": [
    {"price": 0.64, "amount": 500},
    {"price": 0.63, "amount": 300}
  ],
  "asks": [
    {"price": 0.66, "amount": 200},
    {"price": 0.67, "amount": 400}
  ]
}
```

## Frontend Integration

### WebSocket Subscription

```javascript
import { socket } from '@/lib/socket';

// Subscribe to event updates
socket.emit('join-event', eventId);

// Subscribe to order book
socket.emit('subscribe-orderbook', { eventId, option: 'YES' });

// Listen for updates
socket.on('trade-update', (data) => {
  // Handle trade updates
});

socket.on('orderbook-update', (data) => {
  // Handle order book updates
});
```

### Trading Panel

The updated TradingPanel component includes:
- Order type selection (Market/Limit)
- Real-time order book display
- Price inputs for limit orders
- WebSocket-powered updates
- Comprehensive trade feedback

## Benefits

### For Traders
- **Instant Execution**: Market orders execute immediately
- **Price Control**: Limit orders allow precise price setting
- **Best Prices**: System automatically finds optimal execution
- **Transparency**: Real-time order book and price feeds

### For Liquidity Providers
- **Passive Income**: AMM bot earns from spreads
- **Risk Management**: Automated position sizing and hedging
- **Fair Pricing**: LMSR ensures mathematically fair prices
- **Market Making**: Continuous liquidity provision

### For the Platform
- **Reduced Slippage**: Multiple liquidity sources
- **Better UX**: Choice between speed and price control
- **Real-time Data**: Live updates enhance trading experience
- **Scalable Architecture**: Handles high-frequency trading

## Technical Details

### LMSR Formula
```
Price = 1 / (1 + e^((q_no - q_yes) / b))
```
Where:
- `q_yes` = Total YES tokens bought
- `q_no` = Total NO tokens bought  
- `b` = Liquidity parameter (higher = more stable prices)

### Order Matching Priority
1. **Price Priority**: Best prices first
2. **Time Priority**: Earlier orders first
3. **AMM Fallback**: Unfilled amounts execute against AMM

### WebSocket Events
- `trade-update`: New trade execution
- `orderbook-update`: Order book changes
- `odds-update`: AMM price changes
- `portfolio-update`: User balance changes

## Getting Started

1. **Start Development Server**:
   ```bash
   npm run dev
   ```

2. **Access Application**:
   - Next.js App: http://localhost:3000
   - WebSocket Server: ws://localhost:3001

3. **Test Trading**:
   - Visit any event page
   - Use the TradingPanel to place orders
   - Watch real-time updates via WebSocket

## Configuration

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# WebSocket
WEBSOCKET_PORT=3001
CORS_ORIGIN=http://localhost:3000

# AMM Bot Settings
AMM_LIQUIDITY_USD=100000
AMM_SPREAD=0.01
AMM_ORDER_SIZE=10000
```

### AMM Parameters
Adjust liquidity and spread in `lib/hybrid-trading.ts`:
```typescript
const AMM_LIQUIDITY_USD = 100000; // Total liquidity per market
const AMM_SPREAD = 0.01;          // 1% spread around fair price
const AMM_ORDER_SIZE = 10000;     // Order size for AMM bot
```

## Future Enhancements

- **Advanced Order Types**: Stop-loss, conditional orders
- **Portfolio Management**: PnL tracking, position sizing
- **Risk Management**: Position limits, margin requirements
- **API Trading**: RESTful and WebSocket APIs for bots
- **Cross-market Arbitrage**: Multi-event trading strategies

---

This hybrid system provides the best of both worlds: the immediacy of AMM trading and the precision of order book trading, creating a professional-grade prediction market platform.