# Database Tables Analysis: Bets, Trades, Transactions, and Orders

## Overview

This document explains the differences between the four key database tables in the PolyBet system and their usage patterns throughout the codebase.

## 1. Table Definitions from Prisma Schema

### `Bet` Table
```prisma
model Bet {
  id           String   @id @default(cuid())
  amount       Float
  option       String
  userId       String
  eventId      String
  createdAt    DateTime @default(now())
  priceAtTrade Float?
  event        Event    @relation(fields: [eventId], references: [id])
  user         User     @relation(fields: [userId], references: [id])
}
```
**Purpose**: Records individual betting actions by users. This is the legacy table used in the original AMM (Automated Market Maker) system.

### `Trade` Table
```prisma
model Trade {
  id               String    @id @default(cuid())
  eventId          String
  orderId          String    // Taker order ID
  makerOrderId     String?   // Maker order ID (if matched against another order)
  makerUserId      String?   // Maker user ID (if matched against AMM bot or user)
  outcomeId        String?   // Reference to specific outcome (for multiple outcomes)
  option           String?   // Legacy field for binary events: 'YES' or 'NO'
  side             String    // 'buy' or 'sell' from taker perspective
  price            Float     // Execution price
  amount           Float     // Amount traded
  isAmmTrade       Boolean   @default(false) // True if traded against AMM bot
  createdAt        DateTime  @default(now())
}
```
**Purpose**: Records executed trades in the hybrid AMM + order book system. Represents actual market transactions.

### `Transaction` Table
```prisma
model Transaction {
  id        String   @id @default(cuid())
  hash      String   @unique
  type      String
  amount    Float
  status    String
  userId    String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```
**Purpose**: Records blockchain transactions and financial operations. Used for tracking on-chain activity.

### `Order` Table
```prisma
model Order {
  id            String    @id @default(cuid())
  userId        String
  eventId       String
  outcomeId     String?   // Reference to specific outcome (for multiple outcomes)
  option        String?   // Legacy field for binary events: 'YES' or 'NO'
  side          String    // 'buy' or 'sell'
  price         Float     // Price per token (0.01 to 0.99)
  amount        Float     // Total amount to spend
  amountFilled  Float     @default(0.0) // Amount that has been filled
  status        String    @default("open") // 'open', 'partially_filled', 'filled', 'cancelled'
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```
**Purpose**: Records limit orders placed by users in the order book system. Represents intent to trade at specific prices.

## 2. Key Differences

| Feature | Bet | Trade | Transaction | Order |
|---------|-----|-------|-------------|-------|
| **System** | Legacy AMM | Hybrid System | Blockchain | Order Book |
| **Purpose** | User betting action | Executed trade | Financial tx | Limit order |
| **Status** | Completed | Completed | Varies | Open/Filled/Cancelled |
| **Price** | Market price at time | Execution price | N/A | User-specified |
| **Amount** | Total bet amount | Trade amount | Transaction amount | Order amount |
| **Relationship** | Direct user-event | Order execution | Blockchain | Trading intent |

## 3. Usage Patterns in Codebase

### Bet Table Usage
- **API Endpoints**:
  - `GET /api/events/[id]/bets` - Fetch recent bets for activity display
  - `POST /api/bets` - Place new bets (legacy)
  - `GET /api/user/bets` - User's betting history
- **Components**:
  - `ActivityList.tsx` - Shows recent betting activity
  - `UserStats.tsx` - Displays user betting statistics
- **AMM System**:
  - Used in `lib/amm.ts` for historical odds calculation
  - Replays bet history to determine current market state

### Trade Table Usage
- **API Endpoints**:
  - `POST /api/hybrid-trading` - Creates trades from orders
  - Used in historical odds generation for multiple outcomes
- **Components**:
  - Not directly displayed to users (internal system)
- **Hybrid System**:
  - Core of the new hybrid AMM + order book architecture
  - Records actual market executions

### Transaction Table Usage
- **API Endpoints**:
  - `GET /api/user/stats` - User financial statistics
  - `GET /api/users/[address]/stats` - User transaction history
- **Components**:
  - Used in user profile stats display
- **Blockchain**:
  - Tracks on-chain activity and payouts

### Order Table Usage
- **API Endpoints**:
  - `GET /api/order-book` - Fetch current order book
  - `POST /api/hybrid-trading` - Creates orders and trades
- **Components**:
  - `OrderBook.tsx` - Displays current market depth
- **Hybrid System**:
  - Core of limit order functionality
  - Matches orders to create trades

## 4. Evolution and Migration

### Legacy System (Bet-based)
- Simple AMM where users place bets directly
- Bets immediately affect market odds
- No order book or limit orders
- All trades executed at current market price

### Hybrid System (Order/Trade-based)
- Combines AMM liquidity with order book
- Users can place limit orders at specific prices
- Orders match against AMM or other orders
- Executed trades recorded separately
- More sophisticated market dynamics

## 5. Data Flow Examples

### Legacy Bet Flow
1. User places bet via `POST /api/bets`
2. Bet recorded in `Bet` table
3. AMM recalculates odds based on new bet
4. ActivityList shows bet in recent activity

### Hybrid Trade Flow
1. User places order via `POST /api/hybrid-trading`
2. Order recorded in `Order` table (status: 'open')
3. System matches order against AMM or other orders
4. Trade executed and recorded in `Trade` table
5. Order updated (status: 'filled' or 'partially_filled')
6. WebSocket broadcasts trade update
7. OddsGraph and TradingPanel update with new probabilities

## 6. Current State and Migration

The system is in transition between legacy and hybrid models:

- **Legacy components** still use `Bet` table (ActivityList, some stats)
- **New components** use `Order`/`Trade` tables (OrderBook, hybrid trading)
- **Both systems coexist** during migration period
- **Eventual goal**: Full migration to hybrid system

## 7. Security Considerations

- **Bet table**: Public read access (activity display)
- **Trade table**: Internal system use only
- **Transaction table**: User-specific financial data
- **Order table**: User-specific trading intent

## 8. Performance Implications

- **Bet table**: Large volume, cached aggressively
- **Trade table**: High frequency, optimized for writes
- **Order table**: Active orders indexed for matching
- **Transaction table**: Lower volume, audit trail

## Conclusion

The database design reflects the evolution from a simple AMM betting system to a sophisticated hybrid market with order books. The coexistence of legacy (`Bet`) and new (`Order`/`Trade`) tables allows for gradual migration while maintaining backward compatibility.