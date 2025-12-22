-- Add locked column to balances
ALTER TABLE "Balance"
ADD COLUMN IF NOT EXISTS "locked" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- Create ledger table for balance movements
CREATE TABLE IF NOT EXISTS "LedgerEntry" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "direction" TEXT NOT NULL, -- 'CREDIT' or 'DEBIT'
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceBefore" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LedgerEntry_userId_idx" ON "LedgerEntry"("userId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_reference_idx" ON "LedgerEntry"("referenceType","referenceId");




