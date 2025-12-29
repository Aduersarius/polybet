-- CreateTable
CREATE TABLE IF NOT EXISTS "Affiliate" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "website" TEXT,
    "referralCode" TEXT NOT NULL,
    "totalReferrals" INTEGER NOT NULL DEFAULT 0,
    "activeReferrals" INTEGER NOT NULL DEFAULT 0,
    "totalDeposits" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromoCode" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promoCodeId" TEXT,
    "referralSource" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signupDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstDepositDate" TIMESTAMP(3),
    "depositCount" INTEGER NOT NULL DEFAULT 0,
    "totalDepositAmount" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalVolume" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Affiliate_email_key" ON "Affiliate"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Affiliate_referralCode_key" ON "Affiliate"("referralCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Affiliate_referralCode_idx" ON "Affiliate"("referralCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Affiliate_email_idx" ON "Affiliate"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Affiliate_isActive_idx" ON "Affiliate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromoCode_code_idx" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromoCode_affiliateId_idx" ON "PromoCode"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_userId_key" ON "Referral"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_affiliateId_userId_key" ON "Referral"("affiliateId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Referral_affiliateId_idx" ON "Referral"("affiliateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Referral_userId_idx" ON "Referral"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Referral_firstDepositDate_idx" ON "Referral"("firstDepositDate");

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add columns to User table if they don't exist
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredBy" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralDate" TIMESTAMP(3);

