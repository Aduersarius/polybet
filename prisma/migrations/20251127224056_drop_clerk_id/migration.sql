-- DropIndex
DROP INDEX IF EXISTS "User_clerkId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "clerkId";