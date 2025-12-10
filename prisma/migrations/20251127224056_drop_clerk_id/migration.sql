-- DropIndex
DROP INDEX IF EXISTS "User_clerkId_idx";

-- AlterTable
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'clerkId') THEN
        ALTER TABLE "User" DROP COLUMN "clerkId";
    END IF;
END $$;