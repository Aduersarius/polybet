# Polymarket Event Copying and Mapping Implementation Analysis

## Executive Summary

The system implements a **two-stage workflow** for copying and mapping Polymarket events:
1. **Intake** (`/api/polymarket/intake`) - Fetches and normalizes Polymarket events for admin review
2. **Approval** (`/api/polymarket/intake/approve`) - Creates/updates Event records and mappings when approved
3. **Sync** (`/api/polymarket/sync`) - Bulk syncs events directly (bypasses intake workflow)

There's also a **direct markets endpoint** (`/api/polymarket/markets`) that serves normalized Polymarket data for display without creating database records.

---

## Architecture Overview

### Data Flow

```
Polymarket API (gamma-api.polymarket.com)
    ↓
[Intake Endpoint] → Normalize → Admin Review UI
    ↓
[Approve Endpoint] → Create Event + Outcomes + Mapping
    ↓
[Database] → Event, Outcome, PolymarketMarketMapping
    ↓
[Sync Endpoint] → Update existing events
```

### Key Components

1. **Event Model** (`prisma/schema.prisma`)
   - `polymarketId` (unique) - Links to Polymarket event
   - `source: 'POLYMARKET'` - Identifies imported events
   - `externalVolume`, `externalBetCount` - Upstream metrics

2. **Outcome Model**
   - `polymarketOutcomeId` (unique) - Links to Polymarket token
   - `polymarketMarketId` - Links to parent market
   - `source: 'POLYMARKET'` - Identifies imported outcomes

3. **PolymarketMarketMapping Model**
   - Maps `internalEventId` ↔ `polymarketId`
   - Stores `outcomeMapping` JSON for outcome relationships
   - Tracks `status` (approved/rejected) and `isActive`
   - Used for hedging and real-time odds sync

---

## Implementation Details

### 1. Intake Endpoint (`/api/polymarket/intake`)

**Purpose**: Fetch and normalize Polymarket events for admin review

**Key Functions**:

#### `normalizeOutcomes(raw)`
- Handles multiple input formats (array, string JSON, object)
- Extracts: `id`, `name`, `price`, `probability`
- **Critical**: Uses `probFromValue()` to reject invalid probabilities (>100, likely strike levels)

#### `normalizeOutcomePrices(raw)`
- Parses `outcomePrices` array from Polymarket
- **Priority**: `outcomePrices` array is more reliable than individual `outcome.price` fields

#### `probFromValue(raw, fallback)`
- **Smart probability detection**:
  - Handles 0-1 range (probabilities)
  - Handles 0-100 range (percentages) → converts to 0-1
  - **Rejects >100** (likely strike levels, not probabilities)
  - Returns `undefined` for invalid values (caller handles fallback)

#### Probability Normalization Logic
```typescript
// Priority order for probability extraction:
1. outcomePrices array (most reliable)
2. outcome.probability field
3. outcome.price field (but may be strike level)
4. lastTradePrice / bestBid / bestAsk
5. Fallback to 0.5

// For multiple outcomes: normalizes to sum to 1.0
```

#### Grouped Markets Handling
- Detects `groupItemTitle` fields (e.g., Super Bowl teams, companies)
- Aggregates multiple binary markets into a single MULTIPLE event
- Uses `groupItemTitle` as outcome names
- Filters by token availability (only outcomes with `tokenId`)

#### Category Inference
- **Smart category detection** from title/description:
  - Crypto, Politics, Sports, Business, Tech, Science, Entertainment, Pop Culture, World
- Falls back to Polymarket category if available
- Only infers if Polymarket category is missing or "General"

**Output**: Array of `IntakeMarket` objects with `status: 'unmapped'`

---

### 2. Approve Endpoint (`/api/polymarket/intake/approve`)

**Purpose**: Create/update Event records and mappings when admin approves

**Key Operations**:

#### A. Mapping Creation/Update
```typescript
// Creates/updates PolymarketMarketMapping record
{
  internalEventId: string,
  polymarketId: string,
  polymarketConditionId?: string,
  polymarketTokenId?: string,
  outcomeMapping: {
    outcomes: [
      { internalId, polymarketId, name, probability? }
    ]
  },
  status: 'approved',
  isActive: true
}
```

#### B. Event Upsert
- **Uses `polymarketId` as unique key** (upsert by `polymarketId`)
- Sets `source: 'POLYMARKET'`
- Infers `type` (BINARY vs MULTIPLE) from outcome count
- Sets `externalVolume`, `externalBetCount` from Polymarket data

#### C. Outcome Creation/Update
- **Deduplication strategy**:
  1. Check by `polymarketOutcomeId` (global unique)
  2. Check by `(eventId, name)` (event-scoped unique)
  3. Update existing or create new

- **Binary event normalization**:
  - Forces outcome names to "YES"/"NO"
  - Calculates `qYes`/`qNo` from probabilities using inverse LMSR
  - Updates outcome probabilities to match

#### D. Probability Handling
```typescript
// Validation chain:
1. Check if probability is 0-1 (valid)
2. Check if probability is 1-100 (percentage) → convert
3. Reject if > 100 (strike level, not probability)
4. For binary: calculate from qYes/qNo if missing
```

#### E. Odds History Backfill
- Fetches historical prices from Polymarket CLOB API
- Chunks requests (max 90 days per request) to avoid API rejection
- Buckets into 5-minute intervals
- Stores in `OddsHistory` table for charting

#### F. Token Discovery
- If `outcomeMapping` is incomplete, fetches tokens from Polymarket
- Expands mapping to include all tokens (prevents binary collapse)

**Critical Bug Prevention**:
- **Type correction**: If event was binary but has >2 outcomes, forces `type: 'MULTIPLE'`
- **Outcome expansion**: Prevents incomplete mappings from collapsing to binary

---

### 3. Sync Endpoint (`/api/polymarket/sync`)

**Purpose**: Bulk sync events directly (bypasses intake workflow)

**Key Differences from Approve**:
- **No admin approval required** - creates events immediately
- **Simpler logic** - no mapping table status tracking
- **Uses internal `/api/polymarket/markets` endpoint** as data source
- **Updates existing events** by `polymarketId`

**Process**:
1. Fetches events from internal markets endpoint
2. For each event:
   - Upserts Event by `polymarketId`
   - Updates/creates Outcomes
   - Sets `qYes`/`qNo` for binary events from probabilities

**Limitations**:
- Doesn't create `PolymarketMarketMapping` records (no hedging support)
- No odds history backfill
- No token discovery

---

### 4. Markets Endpoint (`/api/polymarket/markets`)

**Purpose**: Serve normalized Polymarket data for display (no DB writes)

**Key Features**:

#### `toDbEvent(market, parent)`
- Normalizes Polymarket market to `DbEvent` shape
- Handles BINARY vs MULTIPLE type detection
- Extracts probabilities with smart fallback chain
- Applies category inference

#### `flattenAndMap(events, seen)`
- **Deduplication**: Uses `seen` Set to prevent duplicates
- **Grouped markets**: Aggregates `groupItemTitle` markets into MULTIPLE events
- **Filtering**: Excludes inactive/closed/zero-volume/resolved markets
- **Priority**: Multi-outcome markets > highest-volume binary market

#### Probability Extraction Priority
```typescript
// For binary markets:
1. outcomePrices[0] (most reliable)
2. lastTradePrice
3. bestBid
4. bestAsk
5. outcome.find(/yes/i).price
6. outcomes[0].price
7. Fallback: 0.5

// For multiple outcomes:
- Uses outcomePrices array if available
- Normalizes to sum to 1.0
- Handles missing probabilities gracefully (shows "—")
```

#### Auto-Mapping (Optional)
- If `?automap=true` query param:
  - Creates `PolymarketMarketMapping` records in background
  - Fire-and-forget (doesn't block response)
  - Batch operations for performance

---

## Critical Issues & Edge Cases

### 1. Probability Validation

**Problem**: Polymarket sometimes returns strike levels (e.g., 120000) in `outcome.price` field, which are NOT probabilities.

**Solution**: `probFromValue()` rejects values > 100:
```typescript
if (n > 100) return undefined; // Not a probability
```

**Impact**: Prevents invalid probabilities from corrupting market data.

---

### 2. Binary vs Multiple Type Detection

**Problem**: Incomplete `outcomeMapping` can cause MULTIPLE events to be created as BINARY.

**Solution** (in approve endpoint):
```typescript
// Fetch tokens up front to infer multiplicity
const { tokens } = await fetchTokensForMarket(polymarketId);
if (tokens.length > normalizedOutcomeMapping.length) {
  // Expand mapping to include all tokens
}
```

**Also**: Type correction after event creation:
```typescript
if (dbEvent.type !== type) {
  await prisma.event.update({ data: { type } });
}
```

---

### 3. Outcome Name Deduplication

**Problem**: Polymarket may send duplicate outcome names.

**Solution**: `dedupeOutcomeNames()`:
```typescript
// Ensures uniqueness by appending suffix
"Outcome" → "Outcome 2" → "Outcome 3"
```

---

### 4. Grouped Markets Aggregation

**Problem**: Polymarket groups related binary markets (e.g., "Which team wins Super Bowl?") as separate markets with `groupItemTitle`.

**Solution**: 
- Detects `groupItemTitle` fields
- Aggregates into single MULTIPLE event
- Uses `groupItemTitle` as outcome names
- Filters by token availability (only tradeable outcomes)

---

### 5. Odds History Backfill

**Problem**: Newly approved events have no historical odds data.

**Solution**:
- Fetches from Polymarket CLOB API `/prices-history`
- Chunks requests (max 90 days) to avoid API rejection
- Buckets into 5-minute intervals
- Falls back to orderbook mid-price if history unavailable

---

### 6. Cache Invalidation

**Problem**: After approval, cached event data may be stale.

**Solution**:
```typescript
await invalidate(`evt:${eventId}`, 'event');
await invalidate(`poly:${polymarketId}`, 'event');
```

---

## Data Quality Concerns

### 1. Probability Normalization

**Current**: Probabilities are normalized to sum to 1.0 for multiple outcomes.

**Issue**: If some probabilities are missing/invalid, normalization may be incorrect.

**Mitigation**: Only normalizes if all probabilities are valid.

---

### 2. Category Inference

**Current**: Infers category from title/description using regex patterns.

**Issue**: May misclassify events (e.g., "Bitcoin ETF" → Crypto, but could be Business).

**Mitigation**: Falls back to Polymarket category if available.

---

### 3. Volume Filtering

**Current**: Markets endpoint filters out zero-volume markets.

**Issue**: May hide legitimate new markets before they get volume.

**Mitigation**: Falls back to all markets if no active markets found.

---

## Performance Considerations

### 1. Batch Operations

**Current**: Approve endpoint processes outcomes one-by-one.

**Optimization Opportunity**: Batch create/update outcomes.

---

### 2. Token Discovery

**Current**: Fetches tokens for each market individually.

**Optimization Opportunity**: Batch fetch tokens for multiple markets.

---

### 3. Odds History Backfill

**Current**: Sequential backfill for each outcome.

**Optimization Opportunity**: Parallel backfill for multiple outcomes.

---

## Recommendations

### 1. **Consolidate Sync Logic**

The sync endpoint and approve endpoint have overlapping logic. Consider:
- Extract shared normalization logic into utility functions
- Use approve endpoint logic for sync (with auto-approval flag)

### 2. **Improve Error Handling**

- Add retry logic for Polymarket API failures
- Log failed mappings for debugging
- Add admin notifications for sync failures

### 3. **Add Validation**

- Validate `polymarketId` format before creating events
- Validate outcome count matches type (BINARY = 2, MULTIPLE > 2)
- Validate probability ranges before storing

### 4. **Monitoring**

- Track sync success/failure rates
- Monitor mapping creation/update frequency
- Alert on probability validation failures

### 5. **Documentation**

- Document Polymarket API rate limits
- Document mapping workflow for admins
- Document probability extraction logic

---

## Code Quality Issues

### 1. **Code Duplication**

- Probability normalization logic duplicated across files
- Outcome creation logic duplicated in sync and approve
- Category inference duplicated in markets and approve

**Fix**: Extract to shared utilities.

### 2. **Type Safety**

- Many `any` types in normalization functions
- Missing type definitions for Polymarket API responses

**Fix**: Add proper TypeScript types.

### 3. **Error Handling**

- Some functions silently fail (e.g., cache invalidation)
- Missing error context in catch blocks

**Fix**: Add structured error logging.

---

## Summary

The implementation is **functional but has room for improvement**:

**Strengths**:
- ✅ Handles edge cases (strike levels, grouped markets, probability validation)
- ✅ Supports both intake workflow and direct sync
- ✅ Smart probability extraction with fallback chain
- ✅ Type correction prevents binary/multiple confusion

**Weaknesses**:
- ❌ Code duplication across endpoints
- ❌ Limited error handling and retry logic
- ❌ Sequential processing (could be parallelized)
- ❌ Missing validation and monitoring

**Priority Fixes**:
1. Extract shared normalization logic
2. Add retry logic for API failures
3. Parallelize odds history backfill
4. Add comprehensive error logging


