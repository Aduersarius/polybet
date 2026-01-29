-- Add accountMode to User table (default LIVE)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountMode" TEXT NOT NULL DEFAULT 'LIVE';

-- Add accountType to Balance table (default LIVE)
ALTER TABLE "Balance" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'LIVE';

-- Create composite unique index for balance with accountType
CREATE UNIQUE INDEX IF NOT EXISTS "Balance_userId_tokenSymbol_eventId_outcomeId_accountType_key" 
  ON "Balance" ("userId", "tokenSymbol", "eventId", "outcomeId", "accountType");

-- Add accountType to Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'LIVE';

-- Add accountType to MarketActivity table
ALTER TABLE "MarketActivity" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'LIVE';

-- Add accountType to LedgerEntry table  
ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'LIVE';

-- Comment: All existing records default to 'LIVE' mode
