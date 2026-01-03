# Polymarket 5-Minute Candles Test

## What This Tests

This script verifies whether Polymarket's API provides 5-minute candles for historical data beyond 30 days.

## Why This Matters

Your current implementation in `/api/polymarket/intake/approve/route.ts` assumes:
- `fidelity=5` only works for ~30 days
- Older data requires `fidelity=720` (12-hour candles)

**If Polymarket actually provides 5-min candles for older data, your history is incomplete.**

## How to Run

### Step 1: Get a Real Token ID

**Option A: From your database**
```bash
# If your database is running:
npm run get-test-tokens

# Or manually query:
SELECT polymarketId, yesTokenId, noTokenId 
FROM "PolymarketMarketMapping" 
WHERE isActive = true 
LIMIT 5;
```

**Option B: From Polymarket API**
```bash
# Get recent markets with token IDs:
curl "https://gamma-api.polymarket.com/markets?limit=10&closed=false" | jq '.[] | {id, title, clobTokenIds}'
```

**Option C: Use a known market**
- Trump 2024: `cmiop7j7j001jbbofmp4h7px9` (example)
- Find real ones from your intake UI or database

### Step 2: Run the Test

```bash
# Replace with real token ID:
npx tsx test-polymarket-5min-candles.ts {YOUR_TOKEN_ID_HERE}

# Example:
npx tsx test-polymarket-5min-candles.ts cmiop7j7j001jbbofmp4h7px9
```

### Step 3: Analyze Results

The script tests these time periods:
- 7 days (recent)
- 30 days (current limit)
- 90 days (test beyond 30)
- 180 days (test older)
- 365 days (test very old)

**Look for:**
- ✅ **Success + points for 90+ days** = Polymarket provides 5-min candles beyond 30 days
- ❌ **Failure/no points for 90+ days** = Current implementation is correct

## Expected Outcomes

### Scenario A: Polymarket DOES provide 5-min candles for old data
```
✅ 7 days      1008 points
✅ 30 days     4320 points  
✅ 90 days     12960 points  ← This would prove it
✅ 180 days    25920 points  ← This would prove it
✅ 365 days    52560 points  ← This would prove it

🎯 CONCLUSION: Polymarket DOES provide 5-min candles for old data!
   Your current implementation is WRONG - it should fetch 5-min candles
   for all time periods, not just 30 days.
```

### Scenario B: Polymarket only provides 5-min candles for ~30 days
```
✅ 7 days      1008 points
✅ 30 days     4320 points
❌ 90 days     0 points
❌ 180 days    0 points
❌ 365 days    0 points

🎯 CONCLUSION: Polymarket only provides 5-min candles for ~30 days.
   Your current implementation is CORRECT for this limitation.
```

## What to Do Based on Results

### If Scenario A (5-min candles available):
1. **Fix the history stream** to fetch 5-min candles in chunks:
   ```typescript
   // Instead of: fidelity=720 for full year
   // Do: fidelity=5 in 90-day chunks
   ```

2. **Update `/api/polymarket/history/stream/route.ts`**:
   ```typescript
   const BUCKET_MS = 1 * 60 * 1000; // 1-minute buckets for better granularity
   ```

3. **Add cron job** to run every 10 minutes:
   ```json
   {
     "crons": [{
       "path": "/api/polymarket/history/stream",
       "schedule": "*/10 * * * *"
     }]
   }
   ```

### If Scenario B (current behavior is correct):
1. **Keep current implementation** - it's already optimal
2. **Fix the cron schedule** in `vercel.json`:
   ```json
   "schedule": "*/2 * * * *"  // Every 2 minutes, not "0 2 * * *"
   ```
3. **Add continuous history stream** to fill gaps between manual approvals

## The Real Issue

Regardless of the test results, your **current problem** is:

1. **No continuous ingestion**: History only gets populated during manual approval
2. **WebSocket not running**: Real-time updates aren't being stored
3. **Wrong cron schedule**: Sports sync runs daily instead of every 2 minutes

**The test will tell you if you need 5-min candles for old data, but you still need to fix the continuous ingestion regardless.**
