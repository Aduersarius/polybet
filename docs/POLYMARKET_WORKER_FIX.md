# Fix Polymarket Worker Error - Deployment Guide

## Problem Summary
The `polymarket-worker` container on Coolify is crashing with:
```
Unknown field `event` for include statement on model `PolymarketMarketMapping`
```

**Root Cause:** The deployed code expects a relation (`PolymarketMarketMapping.event`) that doesn't exist in the VPS database schema.

**Solution:** Add the missing foreign key constraint and regenerate the Prisma client.

---

## Pre-Flight Check ✅

Data integrity check **PASSED**:
- 84 total mappings
- 0 orphaned mappings (all point to valid events)
- **Safe to proceed** with adding the foreign key

---

## Deployment Steps

### Step 1: Apply Database Migration on VPS

SSH into your VPS and run:

```bash
# Connect to your VPS
ssh root@188.137.178.118

# Connect to PostgreSQL
psql "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable"

# Apply the migration
ALTER TABLE "PolymarketMarketMapping" 
ADD CONSTRAINT "PolymarketMarketMapping_internalEventId_fkey" 
FOREIGN KEY ("internalEventId") REFERENCES "Event"("id") 
ON DELETE RESTRICT ON UPDATE CASCADE;

# Verify the constraint was added
\d "PolymarketMarketMapping"

# Exit psql
\q
```

### Step 2: Regenerate Prisma Client in Coolify

In your Coolify deployment for the `polymarket-worker`:

1. **Option A: Rebuild the container** (Recommended)
   ```bash
   # Coolify will:
   # 1. Pull latest code (with updated schema)
   # 2. Run `prisma generate` during build
   # 3. Deploy new container
   ```

2. **Option B: Manual regeneration** (If you can't rebuild immediately)
   ```bash
   # Inside the running container:
   docker exec -it polymarket-worker-container sh
   npx prisma generate
   # Then restart the container
   ```

### Step 3: Verify the Fix

Check the worker logs in Coolify. You should see:
```
[Worker] Loaded 84 mappings, 116 unique token IDs
[Sync] Found 84 active events to sync
```

**No more Prisma errors!**

---

## What Changed?

### Schema Changes (Already in local code)
```prisma
model Event {
  // ... existing fields ...
  polymarketMapping  PolymarketMarketMapping?  @relation("PolymarketMapping")
}

model PolymarketMarketMapping {
  // ... existing fields ...
  event              Event     @relation("PolymarketMapping", fields: [internalEventId], references: [id])
}
```

### Database Changes
- Added foreign key constraint: `PolymarketMarketMapping.internalEventId -> Event.id`
- This constraint **already matched** the data (all mappings point to valid events)
- **No data modification** required

---

## Rollback Plan (if needed)

If something goes wrong, you can remove the constraint:

```sql
ALTER TABLE "PolymarketMarketMapping" 
DROP CONSTRAINT "PolymarketMarketMapping_internalEventId_fkey";
```

---

## Security Analysis

✅ **Safe Migration:**
- Only adds a constraint, doesn't modify data
- All existing mappings are valid (verified by pre-flight check)
- Uses `ON DELETE RESTRICT` to prevent orphaned mappings in the future
- Read-only constraint validation (won't block normal operations)

⚠️ **Potential Issues:**
- If you **delete an Event** that has a mapping, the delete will **fail** (by design)
- Solution: Delete the mapping first, then the event

---

## Better Approach for Future

**This should NEVER have happened.** Here's why it did and how to prevent it:

### What Went Wrong:
1. Schema was updated locally
2. Code was deployed
3. **Migration was NOT run on VPS**
4. Result: Code/schema mismatch

### Prevention Strategy:
1. **Always run migrations before deploying code changes**
2. Use a proper CI/CD pipeline that:
   - Runs `prisma migrate deploy` on the VPS
   - Then deploys the application code
3. **Never manually edit code without corresponding migrations**
4. Add a health check that validates Prisma schema matches database

### Proposed Workflow:
```bash
# 1. Develop locally
npx prisma migrate dev --name add_feature

# 2. Test locally
npm run dev

# 3. Deploy migration to VPS FIRST
ssh root@vps "cd /app && npx prisma migrate deploy"

# 4. THEN deploy code
# (via Coolify rebuild or manual deploy)
```

---

## Questions?

If migration fails, check:
1. Can you connect to the database?
   ```bash
   psql "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet"
   ```

2. Does the constraint already exist?
   ```sql
   SELECT * FROM information_schema.table_constraints 
   WHERE table_name = 'PolymarketMarketMapping';
   ```

3. Are there orphaned mappings? (Re-run check script)
   ```bash
   npx tsx scripts/check-mapping-integrity.ts
   ```
