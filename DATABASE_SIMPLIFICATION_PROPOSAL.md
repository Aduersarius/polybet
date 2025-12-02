# Database Schema Simplification Proposal

## Current Redundancies Analysis

### 1. Bet vs Trade Overlap

**Current Situation:**
- `Bet` table: Legacy AMM system (direct user betting)
- `Trade` table: Hybrid system (order executions)
- Both represent market activity but with different semantics

**Overlap Analysis:**
- Both record user market participation
- Both affect market odds/prices
- Both need to be displayed in activity feeds
- Different data structures but similar conceptual purpose

### 2. Proposed Consolidation Strategy

#### Option A: Unify Bet and Trade into Single "MarketActivity" Table

```prisma
model MarketActivity {
  id               String    @id @default(cuid())
  type             String    // 'BET' | 'TRADE' | 'ORDER_FILL'
  userId           String
  eventId          String
  outcomeId        String?   // For multiple outcomes
  option           String?   // For binary events ('YES'/'NO')
  side             String?   // For trades ('buy'/'sell')
  amount           Float     // Total amount
  price            Float?    // Execution price
  isAmmInteraction Boolean   @default(false) // Was this against AMM?
  orderId          String?   // Related order if applicable
  createdAt        DateTime  @default(now())

  // Relationships
  user    User     @relation(fields: [userId], references: [id])
  event   Event    @relation(fields: [eventId], references: [id])
  outcome Outcome? @relation(fields: [outcomeId], references: [id])
}
```

**Benefits:**
- Single source of truth for all market activity
- Simplified activity feeds and analytics
- Easier migration path from legacy to hybrid system
- Reduced database complexity

**Migration Path:**
1. Create new `MarketActivity` table
2. Migrate existing `Bet` records as type='BET'
3. Migrate existing `Trade` records as type='TRADE'
4. Update all API endpoints to use new table
5. Update components to handle unified activity type
6. Phase out old tables gradually

### 3. Order Table Considerations

**Current Situation:**
- `Order` table represents limit order intent
- Contains status field for order lifecycle
- Separate from execution records (trades)

**Proposal:**
- Keep `Order` table as-is (it serves distinct purpose)
- Orders represent "intent to trade" vs actual executions
- Order lifecycle management is complex and warrants separate table
- Can add `marketActivityId` reference to link to executions

### 4. Transaction Table Considerations

**Current Situation:**
- `Transaction` table tracks blockchain/financial operations
- Separate from trading activity
- Different data model and access patterns

**Proposal:**
- Keep `Transaction` table as-is
- Represents financial/blockchain operations, not trading activity
- Different security and compliance requirements
- Can add optional `marketActivityId` for trading-related transactions

## 5. Simplified Schema Proposal

### Core Tables (4 → 3)

| Current Tables | Proposed Tables | Status |
|---------------|-----------------|--------|
| Bet           | MarketActivity  | Consolidated |
| Trade         | MarketActivity  | Consolidated |
| Order         | Order           | Keep as-is |
| Transaction   | Transaction     | Keep as-is |

### Relationship Diagram

```
User → MarketActivity ← Event
   ↓       ↑
Transaction  Order
```

### 6. Migration Plan

#### Phase 1: Schema Preparation
```sql
-- Create new unified table
CREATE TABLE "MarketActivity" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL, -- 'BET', 'TRADE', 'ORDER_FILL'
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "eventId" TEXT NOT NULL REFERENCES "Event"("id"),
    "outcomeId" TEXT REFERENCES "Outcome"("id"),
    "option" TEXT,
    "side" TEXT,
    "amount" REAL NOT NULL,
    "price" REAL,
    "isAmmInteraction" BOOLEAN DEFAULT FALSE,
    "orderId" TEXT REFERENCES "Order"("id"),
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyBetId" TEXT, -- For migration tracking
    "legacyTradeId" TEXT -- For migration tracking
);

-- Add indexes
CREATE INDEX "MarketActivity_userId_idx" ON "MarketActivity"("userId");
CREATE INDEX "MarketActivity_eventId_idx" ON "MarketActivity"("eventId");
CREATE INDEX "MarketActivity_createdAt_idx" ON "MarketActivity"("createdAt");
```

#### Phase 2: Data Migration
```javascript
// Migration script (pseudocode)
async function migrateMarketActivity() {
    // Migrate Bet records
    const bets = await prisma.bet.findMany();
    for (const bet of bets) {
        await prisma.marketActivity.create({
            data: {
                type: 'BET',
                userId: bet.userId,
                eventId: bet.eventId,
                amount: bet.amount,
                price: bet.priceAtTrade,
                option: bet.option,
                isAmmInteraction: true, // All legacy bets were AMM interactions
                legacyBetId: bet.id,
                createdAt: bet.createdAt
            }
        });
    }

    // Migrate Trade records
    const trades = await prisma.trade.findMany();
    for (const trade of trades) {
        await prisma.marketActivity.create({
            data: {
                type: 'TRADE',
                userId: trade.makerUserId || 'SYSTEM', // Handle AMM trades
                eventId: trade.eventId,
                outcomeId: trade.outcomeId,
                option: trade.option,
                side: trade.side,
                amount: trade.amount,
                price: trade.price,
                isAmmInteraction: trade.isAmmTrade,
                orderId: trade.orderId,
                legacyTradeId: trade.id,
                createdAt: trade.createdAt
            }
        });
    }
}
```

#### Phase 3: API Updates
```typescript
// Updated ActivityList API endpoint
export async function GET(request: NextRequest) {
    const { id: eventId } = await params;

    // Single query for all market activity
    const activities = await prisma.marketActivity.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
            user: {
                select: {
                    username: true,
                    address: true,
                    avatarUrl: true,
                },
            },
        },
    });

    return NextResponse.json({
        activities: activities.map(activity => ({
            id: activity.id,
            type: activity.type,
            amount: activity.amount,
            option: activity.option || (activity.side === 'buy' ? 'YES' : 'NO'),
            createdAt: activity.createdAt,
            user: activity.user,
            price: activity.price,
            isAmm: activity.isAmmInteraction
        }))
    });
}
```

#### Phase 4: Component Updates
```typescript
// Updated ActivityList component
export function ActivityList({ eventId }: ActivityListProps) {
    const { data: activities, isLoading, error } = useQuery({
        queryKey: ['market-activity', eventId],
        queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}/activity`);
            return res.json();
        },
        refetchInterval: 5000,
    });

    if (isLoading) return <LoadingSpinner />;

    if (error) return <ErrorMessage />;

    if (!activities || activities.length === 0) {
        return <div>No market activity yet. Be the first to trade!</div>;
    }

    return (
        <div>
            {activities.map((activity) => (
                <ActivityItem
                    key={activity.id}
                    activity={activity}
                    showTypeBadge={true}
                />
            ))}
        </div>
    );
}
```

### 7. Backward Compatibility

**API Endpoints:**
- Keep legacy `/api/events/[id]/bets` endpoint as proxy to new system
- Add new `/api/events/[id]/activity` endpoint for unified access
- Deprecate old endpoints over time

**Database:**
- Keep old tables during transition period
- Add triggers to sync writes to both old and new tables
- Gradual data migration with validation

### 8. Benefits of Simplification

1. **Reduced Complexity**: 4 tables → 3 tables
2. **Unified Activity Tracking**: Single source for all market activity
3. **Simplified Analytics**: Easier to query and analyze market behavior
4. **Cleaner Migration Path**: Smoother transition from legacy to hybrid system
5. **Improved Performance**: Single table queries vs multiple table joins
6. **Easier Maintenance**: Less code duplication, clearer data model

### 9. Risk Assessment

**Low Risk:**
- Data migration can be done gradually
- Old tables preserved during transition
- Backward compatibility maintained
- Comprehensive testing possible

**High Value:**
- Significant codebase simplification
- Better developer experience
- Improved system reliability
- Foundation for future features

### 10. Recommendation

**Implement the consolidation in phases:**
1. **Phase 1**: Create new `MarketActivity` table alongside existing tables
2. **Phase 2**: Update write operations to write to both old and new tables
3. **Phase 3**: Migrate read operations to new table gradually
4. **Phase 4**: Deprecate old tables after full migration

This approach provides a safe migration path while achieving significant long-term benefits in code simplicity and maintainability.