-- Add new columns and tables for multiple outcomes support

-- Add new columns to Event table
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "result" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'BINARY';

-- Create Outcome table
CREATE TABLE IF NOT EXISTS "Outcome" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "liquidity" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- Add new columns to Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "outcomeId" TEXT;

-- Add new columns to Trade table
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "outcomeId" TEXT;

-- Add new column to Balance table
ALTER TABLE "Balance" ADD COLUMN IF NOT EXISTS "outcomeId" TEXT;

-- Drop old unique constraint and create new one
ALTER TABLE "Balance" DROP CONSTRAINT IF EXISTS "Balance_userId_tokenSymbol_eventId_key";
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_tokenSymbol_eventId_outcomeId_key" UNIQUE ("userId", "tokenSymbol", "eventId", "outcomeId");

-- Create indexes
CREATE INDEX IF NOT EXISTS "Outcome_eventId_idx" ON "Outcome"("eventId");
CREATE INDEX IF NOT EXISTS "Outcome_eventId_name_key" ON "Outcome"("eventId", "name");

-- Add foreign key constraints
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;