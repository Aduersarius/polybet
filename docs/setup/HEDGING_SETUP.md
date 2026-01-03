# Polymarket Hedging System - Setup Guide

This guide explains how to set up and configure the automated hedging system that allows your platform to automatically hedge user orders on Polymarket.

## Overview

The hedging system works by:
1. **Taking user orders** on your platform at a quoted price
2. **Adding a spread** to capture profit (e.g., 2-5%)
3. **Automatically placing** the opposite order on Polymarket to hedge your risk
4. **Monitoring and managing** positions in real-time

## Architecture Components

### 1. Database Schema
- `HedgePosition` - Tracks each hedge (status, prices, profit)
- `PolymarketMarketMapping` - Maps your internal events to Polymarket markets
- `RiskSnapshot` - Historical risk exposure data
- `HedgeConfig` - Runtime configuration settings

### 2. Core Services
- **PolymarketTradingService** (`lib/polymarket-trading.ts`) - Handles Polymarket CLOB API interactions
- **HedgeManager** (`lib/hedge-manager.ts`) - Core hedging logic and risk management
- **Hybrid Trading** (`lib/hybrid-trading.ts`) - Extended with automatic hedging triggers

### 3. API Endpoints
- `GET /api/hedge/dashboard` - Real-time hedge performance metrics
- `GET/POST /api/hedge/config` - Hedge configuration management

## Environment Variables Setup

Add the following to your `.env` file:

```bash
# ============================================
# POLYMARKET HEDGING CONFIGURATION
# ============================================

# Polymarket CLOB API URL (Production)
POLYMARKET_CLOB_API_URL=https://clob.polymarket.com

# Your Polymarket API Key (Get from Polymarket team)
POLYMARKET_API_KEY=YOUR_API_KEY_HERE

# Private key for signing orders (KEEP SECURE!)
# This should be the private key of your Polymarket proxy wallet
POLYMARKET_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE

# Polygon Chain ID (137 for mainnet, 80001 for Mumbai testnet)
POLYMARKET_CHAIN_ID=137
```

### Getting Polymarket API Credentials

1. **Contact Polymarket** - Email their team to request API trading access
   - They will review your use case
   - You'll need to explain you're building an aggregator/market maker
   
2. **Set up Proxy Wallet** 
   - Polymarket uses proxy wallets for automated trading
   - Follow their documentation to deploy a proxy wallet contract
   - Fund it with USDC for trading

3. **Generate API Keys**
   - Once approved, you'll receive API keys
   - Keep them secure and never commit to git

## Database Migration

Run the Prisma migration to add the hedging tables:

```bash
# Generate migration
npx prisma migrate dev --name add_hedging_system

# Apply migration to production
npx prisma migrate deploy
```

## Initial Configuration

### 1. Enable Hedging

By default, hedging is **disabled**. Enable it via API:

```bash
curl -X POST http://localhost:3000/api/hedge/config \
  -H "Content-Type: application/json" \
  -d '{
    "key": "enabled",
    "value": true,
    "updatedBy": "admin"
  }'
```

### 2. Configure Spread Settings

Set your minimum spread (in basis points, 100 = 1%):

```bash
curl -X POST http://localhost:3000/api/hedge/config \
  -H "Content-Type: application/json" \
  -d '{
    "key": "minSpreadBps",
    "value": 200,
    "updatedBy": "admin"
  }'
```

**Recommended Settings:**
- `minSpreadBps`: 200-300 (2-3%) - Must cover Polymarket fees (~2%) + profit
- `maxSlippageBps`: 100 (1%) - Maximum acceptable slippage
- `maxUnhedgedExposure`: 10000 ($10k) - Risk limit
- `maxPositionSize`: 1000 ($1k) - Max single hedge size

### 3. Create Market Mappings

Map your internal events to Polymarket markets:

```sql
INSERT INTO "PolymarketMarketMapping" (
  id, 
  "internalEventId", 
  "polymarketId", 
  "polymarketConditionId",
  "polymarketTokenId",
  "isActive"
) VALUES (
  gen_random_uuid(),
  'your-internal-event-id',
  '12345', -- Polymarket market ID
  '0xabc...', -- Polymarket condition ID (from CLOB API)
  '0xdef...', -- Token contract address
  true
);
```

## Monitoring & Operations

### View Dashboard

Access the hedge dashboard:

```bash
curl http://localhost:3000/api/hedge/dashboard?period=24h
```

This returns:
- Success rate
- Total profit/fees
- Current exposure
- Recent failures
- Market breakdown

### Risk Snapshots

The system automatically takes risk snapshots. Query them:

```sql
SELECT * FROM "RiskSnapshot" 
ORDER BY timestamp DESC 
LIMIT 10;
```

### Monitor Failed Hedges

Check for failures:

```sql
SELECT 
  id, 
  "userOrderId", 
  "failureReason", 
  "createdAt", 
  amount 
FROM "HedgePosition" 
WHERE status = 'failed' 
ORDER BY "createdAt" DESC 
LIMIT 20;
```

## How It Works

### User Places Order

1. User places a market order to buy 100 shares at current price
2. Your platform quotes 0.52 per share
3. System checks if hedging is feasible

### Hedge Execution

```
User Order: BUY 100 @ 0.52 = $52
↓
Spread Calculation: 2% spread = 0.52 * 0.98 = 0.5096
↓
Polymarket Check: Can we buy 100 @ ≤0.5096?
↓ (if yes)
Place Hedge: BUY 100 @ 0.50 on Polymarket
↓
Profit: (0.52 - 0.50) * 100 = $2.00
Fees: ~$1.04 (2% of $52)
Net Profit: $0.96 per trade
```

### Risk Management

- **Pre-trade checks**: Verify liquidity before accepting user orders
- **Exposure limits**: Reject orders that would exceed risk limits
- **Failure handling**: If hedge fails, position is marked as unhedged
- **Monitoring**: Dashboard shows real-time exposure and alerts

## Safety Features

### Circuit Breakers

The system will auto-disable hedging if:
- Failure rate > 10% in last hour
- Unhedged exposure > max limit
- Polymarket connection fails

### Position Limits

- Maximum single position: Configurable (default $1k)
- Maximum total unhedged: Configurable (default $10k)
- Per-market exposure tracking

### Fallback Behavior

If hedging is disabled or fails:
- User orders are still accepted
- Positions remain unhedged
- You take directional risk (like a traditional prediction market)

## Testing

### Paper Trading Mode

Test hedging without real orders:

1. Set `enabled: false` in config
2. Monitor logs to see what hedges would be placed
3. Use the dashboard to track metrics

### Testnet Testing

1. Use Polygon Mumbai testnet (`POLYMARKET_CHAIN_ID=80001`)
2. Get testnet USDC from faucets
3. Test full flow with small amounts

## Troubleshooting

### Hedges Always Failing

Check:
- Are Polymarket credentials valid?
- Is the proxy wallet funded with USDC?
- Are market mappings correct?
- Is there sufficient liquidity on Polymarket?

### High Failure Rate

Possible causes:
- Spread too aggressive (increase `minSpreadBps`)
- Slippage tolerance too tight (increase `maxSlippageBps`)
- Position sizes too large (decrease `maxPositionSize`)
- Market volatility (Polymarket prices moving fast)

### Unhedged Exposure Growing

Actions:
- Review failed hedges in dashboard
- Manually close positions if needed
- Adjust configuration to be more conservative
- Consider pausing trading on problematic markets

## Performance Optimization

### Reduce Latency

- Deploy close to Polymarket's servers
- Use WebSocket connections (future enhancement)
- Pre-authorize transactions
- Optimize database queries

### Improve Success Rate

- Increase spread to handle volatility
- Use limit orders instead of market orders
- Implement multi-tier hedging (hedge in batches)
- Add liquidity aggregation from multiple sources

## Advanced Features (Future)

- **Partial hedging**: Hedge only percentage of risk
- **Delta hedging**: Continuous rebalancing
- **Multi-source hedging**: Use multiple DEXs/CEXs
- **ML-based spread optimization**: Dynamic spread based on market conditions
- **Hedge bundling**: Combine small positions into larger hedges

## Security Considerations

⚠️ **CRITICAL**: 
- Never commit `.env` with real credentials
- Use hardware wallets for production keys
- Implement IP whitelisting for API keys
- Set up alerts for unusual activity
- Regularly rotate API keys
- Monitor for front-running attempts

## Support

For issues or questions:
1. Check logs in `/api/hedge/dashboard`
2. Review failed hedges in database
3. Adjust configuration as needed
4. Contact Polymarket support for API issues

---

**Last Updated**: December 2024

