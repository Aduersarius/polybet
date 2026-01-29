-- AlterTable User: Add accountMode field
ALTER TABLE "user" ADD COLUMN "accountMode" TEXT NOT NULL DEFAULT 'LIVE';

-- AlterTable Balance: Add accountType field and update unique constraint
ALTER TABLE "Balance" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'LIVE';

-- Drop old unique constraint
ALTER TABLE "Balance" DROP CONSTRAINT IF EXISTS "Balance_userId_tokenSymbol_eventId_outcomeId_key";

-- Add new unique constraint with accountType
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_tokenSymbol_eventId_outcomeId_accountType_key" 
    UNIQUE ("userId", "tokenSymbol", "eventId", "outcomeId", "accountType");

-- Add index on accountType
CREATE INDEX "Balance_accountType_idx" ON "Balance"("accountType");

-- AlterTable Order: Add accountType field
ALTER TABLE "Order" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'LIVE';
CREATE INDEX "Order_accountType_idx" ON "Order"("accountType");

-- AlterTable MarketActivity: Add accountType field
ALTER TABLE "MarketActivity" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'LIVE';
CREATE INDEX "MarketActivity_accountType_idx" ON "MarketActivity"("accountType");

-- AlterTable Transaction: Add accountType field
ALTER TABLE "Transaction" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'LIVE';
CREATE INDEX "Transaction_accountType_idx" ON "Transaction"("accountType");

-- AlterTable LedgerEntry: Add accountType field
ALTER TABLE "LedgerEntry" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'LIVE';
CREATE INDEX "LedgerEntry_accountType_idx" ON "LedgerEntry"("accountType");
