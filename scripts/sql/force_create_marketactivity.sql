-- Create MarketActivity table if it doesn't exist
CREATE TABLE IF NOT EXISTS "MarketActivity" (
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

-- Create indexes
CREATE INDEX IF NOT EXISTS "MarketActivity_eventId_idx" ON "MarketActivity"("eventId");
CREATE INDEX IF NOT EXISTS "MarketActivity_userId_idx" ON "MarketActivity"("userId");
CREATE INDEX IF NOT EXISTS "MarketActivity_createdAt_idx" ON "MarketActivity"("createdAt");
CREATE INDEX IF NOT EXISTS "MarketActivity_orderId_idx" ON "MarketActivity"("orderId");
