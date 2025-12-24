-- Align auth-related tables with prisma schema / better-auth expectations
-- Safe to run repeatedly thanks to IF NOT EXISTS checks.

-- User table additions
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "settings" JSONB;

-- Session table additions
ALTER TABLE "Session"
    ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
    ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
