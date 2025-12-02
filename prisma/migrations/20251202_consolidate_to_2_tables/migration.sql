-- Migration: Consolidate Bet and Trade tables into MarketActivity
-- Date: 2025-12-02

BEGIN;

-- Step 1: Create new MarketActivity table
CREATE TABLE "MarketActivity" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "option" TEXT,
    "side" TEXT,
    "amount" REAL NOT NULL,
    "price" REAL,
    "isAmmInteraction" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE,
    FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL,
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL
);

-- Step 2: Migrate data from Bet table
INSERT INTO "MarketActivity" (
    "id", "type", "userId", "eventId", "outcomeId", "option", "side", "amount", "price", "isAmmInteraction", "orderId", "createdAt"
)
SELECT
    "id", 'BET', "userId", "eventId", NULL, "option", NULL, "amount", "priceAtTrade", true, NULL, "createdAt"
FROM "Bet";

-- Step 3: Migrate data from Trade table
INSERT INTO "MarketActivity" (
    "id", "type", "userId", "eventId", "outcomeId", "option", "side", "amount", "price", "isAmmInteraction", "orderId", "createdAt"
)
SELECT
    "id",
    CASE WHEN "isAmmTrade" = true THEN 'TRADE'
         ELSE 'ORDER_FILL'
    END,
    "makerUserId", "eventId", "outcomeId", "option", "side", "amount", "price", "isAmmTrade", "orderId", "createdAt"
FROM "Trade";

-- Step 4: Create indexes for MarketActivity
CREATE INDEX "MarketActivity_eventId_idx" ON "MarketActivity"("eventId");
CREATE INDEX "MarketActivity_userId_idx" ON "MarketActivity"("userId");
CREATE INDEX "MarketActivity_createdAt_idx" ON "MarketActivity"("createdAt");
CREATE INDEX "MarketActivity_orderId_idx" ON "MarketActivity"("orderId");

COMMIT;