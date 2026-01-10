# URGENT: Polymarket Worker Fix - Action Required

## Status: ✅ DATABASE MIGRATION COMPLETE

The database schema has been **successfully updated** on your VPS. The foreign key constraint is now in place.

---

## ⚠️ NEXT STEP REQUIRED

**You must rebuild the `polymarket-worker` container in Coolify** for the fix to take effect.

### How to Redeploy:

1. **Go to your Coolify dashboard**
   - URL: `https://your-coolify-instance.com`

2. **Find the `polymarket-worker` service**

3. **Click "Redeploy" or "Rebuild"**
   - This will:
     - Pull latest code (with updated schema.prisma)
     - Run `npx prisma generate` 
     - Create new Prisma client with the `event` relation
     - Start the container

4. **Monitor the logs**
   - You should see:
     ```
     [Worker] Loading active market mappings...
     [Worker] Loaded 84 mappings, 116 unique token IDs
     [Sync] Starting periodic odds sync...
     ```
   - **NO MORE Prisma errors!**

---

## What Was Fixed?

### The Problem
```
Invalid `prisma.polymarketMarketMapping.findMany()` invocation:
Unknown field `event` for include statement
```

### The Root Cause
- **Code expected** a relation: `PolymarketMarketMapping.event`
- **Database had** no foreign key constraint
- **Result:** Prisma client couldn't include the relation

### The Solution
✅ Added foreign key constraint in database
```sql
ALTER TABLE "PolymarketMarketMapping" 
ADD CONSTRAINT "PolymarketMarketMapping_internalEventId_fkey" 
FOREIGN KEY ("internalEventId") REFERENCES "Event"("id");
```

✅ Updated Prisma schema locally
```prisma
model PolymarketMarketMapping {
  // ... fields ...
  event Event @relation("PolymarketMapping", fields: [internalEventId], references: [id])
}
```

---

## Verification

After redeploying, check the worker logs. You should see these processes running:

- ✅ **[Worker]** Loading mappings
- ✅ **[Sync]** Periodic odds sync
- ✅ **[Resolution]** Market resolution sync
- ✅ **[Reconcile]** Event reconciliation
- ✅ **[HedgeReconcile]** Hedge position checks
- ✅ **[Backfill]** Historical data processing

**NO Prisma validation errors!**

---

## Files Changed

### Production (VPS)
- ✅ Database: Added foreign key constraint

### Local Repository
- ✅ `prisma/schema.prisma` - Added relations
- 📝 `docs/POLYMARKET_WORKER_FIX.md` - Full documentation
- 🔧 `scripts/apply-vps-migration.sh` - Migration script (already run)
- 🔍 `scripts/check-mapping-integrity.ts` - Pre-flight check

---

## Commit & Push

Don't forget to commit these changes:

```bash
git add prisma/schema.prisma
git add docs/POLYMARKET_WORKER_FIX.md
git add scripts/check-mapping-integrity.ts
git add scripts/apply-vps-migration.sh
git commit -m "fix: add missing PolymarketMarketMapping->Event relation

- Added foreign key constraint to database
- Updated Prisma schema with bidirectional relation
- Fixes polymarket-worker container crash on VPS
- Added migration scripts and documentation"
git push
```

---

## Questions?

If the worker still has issues after redeployment:

1. **Check Prisma client version** in container:
   ```bash
   docker exec -it polymarket-worker npx prisma --version
   ```

2. **Manually regenerate if needed**:
   ```bash
   docker exec -it polymarket-worker npx prisma generate
   docker restart polymarket-worker
   ```

3. **Review full logs**:
   ```bash
   docker logs polymarket-worker --tail 100
   ```

---

## Lessons Learned

### What Went Wrong
1. Schema was updated locally
2. Code was deployed to production
3. **Database migration was skipped** ❌
4. Result: Runtime Prisma validation errors

### Prevention
1. **ALWAYS run migrations before deploying code**
2. Use proper CI/CD with migration steps
3. Add health checks for schema/DB sync
4. Test locally with production-like data

### Better Workflow
```
Local Dev → Migration → Test → Deploy Migration → Deploy Code
```

**NOT**: `Local Dev → Deploy Code → Break production` ❌

---

**Time to fix:** ~5 minutes  
**Impact:** High (worker was completely down)  
**Severity:** Critical deployment mismatch  
**Status:** Database fixed ✅ | Code deployment pending ⏳
