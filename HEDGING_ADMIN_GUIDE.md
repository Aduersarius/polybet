# Hedging Dashboard - Admin Panel Guide

## 🎯 Quick Access

**URL:** `http://localhost:3000/admin?view=hedging`

Or navigate from Admin Panel → Click "Hedging" in the sidebar

---

## 📊 What You'll See

### Current Status: NOT HEDGING YET

Right now, the dashboard will show:
- ⚠️ **System Status: Disabled** or **Disconnected**
- Message: "Polymarket credentials not configured"
- Setup instructions

**Why?** Because you need to provide YOUR Polymarket account credentials first.

---

## 🔑 About Credentials & Private Keys

### How Hedging Works

```
Your Platform           Polymarket
     ↓                      ↓
User places order    →  System needs to place
at price X              opposite order at price Y
     ↓                      ↓
You accept          →  Sign transaction with
                        YOUR private key
     ↓                      ↓
Order filled        →  Hedge executed
                        on Polymarket
```

### What You Need

1. **Polymarket Account**
   - Contact: [Polymarket Team](mailto:hello@polymarket.com)
   - Request: API trading access
   - Use case: "Market making / Order book aggregator"

2. **Proxy Wallet**
   - Smart contract wallet for automated trading
   - Polymarket will help you set this up
   - You fund it with USDC

3. **Private Key**
   - This is the KEY to your proxy wallet
   - Used to sign blockchain transactions
   - **MUST BE KEPT SECRET**

4. **API Key**
   - Authentication for Polymarket's API
   - Less sensitive than private key
   - Rate limited per account

### Where Keys Are Stored

```bash
# .env file (NEVER commit to git!)
POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...  # Your wallet's private key
POLYMARKET_API_KEY=abc123def456...             # API authentication
```

**Security:**
- Keys stored only in `.env` on your server
- Never sent to frontend
- Used only by backend to sign transactions
- Git ignores `.env` file (already configured)

---

## 📈 Dashboard Features

### 1. System Health Banner
Shows current status:
- 🟢 **Healthy** - All systems go
- 🟡 **Disabled** - Hedging turned off (default)
- 🟠 **High Exposure** - Too many unhedged positions
- 🔴 **Disconnected** - Credentials not configured

**Actions:**
- Enable/Disable hedging with one click
- Updates configuration in real-time

### 2. Main Metrics Cards

**Success Rate**
- Percentage of successful hedges
- Target: >95%
- Shows successful/total hedge count

**Net Profit**
- Total profit after fees
- Includes profit margin percentage
- Updates in real-time

**Unhedged Exposure**
- USD value of positions without hedges
- Number of open unhedged positions
- Alert if >80% of limit

**Avg Hedge Time**
- How long hedges take to execute
- Target: <5 seconds
- Indicates API performance

### 3. Profit Breakdown
- Spread captured (revenue)
- Polymarket fees (cost)
- Net profit (after fees)

### 4. Configuration Panel
Shows current settings:
- Hedging enabled/disabled
- Min spread (e.g., 2%)
- Max slippage tolerance
- Max position size
- Max unhedged exposure limit

### 5. Top Markets
- Markets with most hedge volume
- Profit per market
- Number of hedges

### 6. Recent Failures
Debug panel showing:
- Why hedges failed
- Order details
- Timestamps
- Amounts

---

## 🚀 Getting Started

### Step 1: Get Credentials (External)

Contact Polymarket:
```
To: hello@polymarket.com
Subject: API Trading Access Request

Hi,

I'm building a prediction market aggregator and would like 
API trading access to hedge user orders on your platform.

Our platform: [Your URL]
Expected volume: [Estimate]
Use case: Market making / Order aggregation

Please let me know the process for getting API credentials 
and setting up a proxy wallet.

Thanks!
```

### Step 2: Add to .env

Once you have credentials:
```bash
# Add to your .env file
POLYMARKET_CLOB_API_URL=https://clob.polymarket.com
POLYMARKET_API_KEY=your_api_key_from_polymarket
POLYMARKET_PRIVATE_KEY=0xYourPrivateKeyHere
POLYMARKET_CHAIN_ID=137  # Polygon mainnet
```

### Step 3: Run Initialization

```bash
# Stop your dev server first
# Then run:
npx tsx scripts/init-hedging.ts

# This will:
# ✓ Create default configuration
# ✓ Check environment variables  
# ✓ Test Polymarket connection
# ✓ Show next steps
```

### Step 4: Create Market Mappings

Map your events to Polymarket markets:

```sql
-- Example: Map your Bitcoin event to Polymarket's Bitcoin market
INSERT INTO "PolymarketMarketMapping" (
  id,
  "internalEventId",
  "polymarketId",
  "polymarketConditionId",
  "polymarketTokenId",
  "isActive"
) VALUES (
  gen_random_uuid(),
  'your-event-id',              -- Your internal event ID
  '21742',                       -- Polymarket market ID
  '0xabc123...',                 -- From Polymarket CLOB API
  '0xdef456...',                 -- Token contract address
  true
);
```

**How to find Polymarket IDs:**
```bash
# Fetch market details
curl https://gamma-api.polymarket.com/events/21742

# Or check Polymarket URL:
# https://polymarket.com/event/bitcoin-price-2025
#                              ^^^^^^^^^^^^^^^^^^^^^ - this is the slug
```

### Step 5: Enable in Dashboard

1. Go to: `http://localhost:3000/admin?view=hedging`
2. Click **"Enable Hedging"** button
3. Monitor the dashboard

### Step 6: Test with Small Limits

Start conservative:
```bash
# Set low limits for testing
curl -X POST http://localhost:3000/api/hedge/config \
  -H "Content-Type: application/json" \
  -d '{"key": "maxPositionSize", "value": 100}'

curl -X POST http://localhost:3000/api/hedge/config \
  -H "Content-Type: application/json" \
  -d '{"key": "maxUnhedgedExposure", "value": 1000}'
```

---

## 🎮 Using the Dashboard

### Real-Time Monitoring

Dashboard auto-refreshes every 30 seconds.

**Time Period Selector:**
- Last Hour
- Last 24 Hours (default)
- Last 7 Days

**Manual Refresh:**
Click "Refresh" button anytime

### Reading the Metrics

**Success Rate: 95%**
- ✅ Healthy if >95%
- ⚠️ Warning if 80-95%
- ❌ Critical if <80%

**Net Profit: $123.45**
- Should be positive
- Margin should be 1-3%
- If negative, increase spread

**Unhedged Exposure: $450 / $10,000**
- Shows current / limit
- ⚠️ Alert if >80% of limit
- Review failed hedges if growing

**Avg Hedge Time: 2.3s**
- ✅ Good if <5s
- ⚠️ Slow if 5-10s
- ❌ Problem if >10s

### Troubleshooting Failures

If you see failures in the "Recent Failures" section:

**"No liquidity available"**
- Polymarket market is illiquid
- Increase spread or decrease position size
- Consider manual hedging

**"Insufficient liquidity or high slippage"**
- Your position too large for available liquidity
- Decrease `maxPositionSize`
- Or increase `maxSlippageBps`

**"Failed to check Polymarket liquidity"**
- API connection issue
- Check Polymarket API status
- Verify API key is valid

**"Hedging is disabled"**
- System auto-disabled due to high failure rate
- Review configuration
- Fix issues then re-enable

### Adjusting Configuration

Use the API or add UI controls:

**Increase Spread (More profit, less competitive):**
```bash
curl -X POST http://localhost:3000/api/hedge/config \
  -d '{"key": "minSpreadBps", "value": 300}'  # 3%
```

**Increase Slippage Tolerance (More hedges succeed):**
```bash
curl -X POST http://localhost:3000/api/hedge/config \
  -d '{"key": "maxSlippageBps", "value": 150}'  # 1.5%
```

**Increase Position Limits (Scale up):**
```bash
curl -X POST http://localhost:3000/api/hedge/config \
  -d '{"key": "maxPositionSize", "value": 5000}'  # $5k
```

---

## 📊 Understanding Profit Breakdown

### Example Trade

**User Order:**
- User buys 100 shares at $0.52
- Total: $52

**Your Platform:**
- Accept at $0.52 (user price)
- Calculate 2% spread
- Hedge price: $0.52 × 0.98 = $0.5096

**Hedge on Polymarket:**
- Buy 100 shares at $0.50 (market fills here)
- Polymarket charges 2% fee: $52 × 0.02 = $1.04
- Gas cost: ~$0.10

**Profit Calculation:**
```
Spread Captured:  ($0.52 - $0.50) × 100 = $2.00
Polymarket Fees:  $1.04
Gas Costs:        $0.10
─────────────────────────────────────
Net Profit:       $0.86
Profit Margin:    $0.86 / $52 = 1.65%
```

**In Dashboard:**
- Spread Captured: $2.00
- Polymarket Fees: -$1.04
- **Net Profit: $0.86**

---

## 🔔 Alerts & Notifications

### When to Act

**Failure Rate >10%**
→ Investigate in "Recent Failures"
→ Adjust spread or slippage limits
→ Check Polymarket API status

**Unhedged Exposure >80%**
→ Review why hedges are failing
→ Consider manual hedging
→ Pause new orders if needed

**Avg Hedge Time >10s**
→ Check API latency
→ Consider server location
→ Review Polymarket status

### Auto-Disable Circuit Breaker

System will auto-disable if:
- Failure rate >20% in last hour
- Unhedged exposure >100% of limit
- Critical API errors

---

## 💰 Expected Performance

### Realistic Targets

**Success Rate:** 95-98%
- Some failures are normal (market volatility, liquidity)
- >98% is excellent
- <90% needs investigation

**Net Profit Margin:** 0.5-2%
- After all fees
- Depends on spread and competition
- Lower spread = more volume, less profit per trade
- Higher spread = less volume, more profit per trade

**Hedge Time:** 1-5 seconds
- Depends on API latency
- Network location matters
- Polygon network speed

### Volume Requirements

To be profitable:
- Need consistent volume
- Minimum: ~100 trades/day
- Better: 1000+ trades/day
- Spread compounds over volume

---

## 📞 Support

### Dashboard Shows Error?

1. Check browser console (F12)
2. Check server logs
3. Verify environment variables
4. Test API endpoint manually:
   ```bash
   curl http://localhost:3000/api/hedge/dashboard?period=24h
   ```

### Need Help?

1. Review `HEDGING_SETUP.md` for detailed setup
2. Check `HEDGING_IMPLEMENTATION_SUMMARY.md` for technical details
3. Run `npx tsx examples/hedging-example.ts` for code examples
4. Check Polymarket docs: https://docs.polymarket.com

---

**Last Updated:** December 2024
**Dashboard Status:** ✅ Ready (Requires Credentials)
