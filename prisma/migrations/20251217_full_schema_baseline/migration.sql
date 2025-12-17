-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "address" TEXT,
    "username" TEXT,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatarUrl" TEXT,
    "description" TEXT,
    "discord" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN DEFAULT false,
    "telegram" TEXT,
    "twitter" TEXT,
    "website" TEXT,
    "email" TEXT,
    "password" TEXT,
    "settings" JSONB,
    "lastIp" TEXT,
    "lastCountry" TEXT,
    "lastRegion" TEXT,
    "lastCity" TEXT,
    "lastTimezone" TEXT,
    "lastAsn" INTEGER,
    "lastIsp" TEXT,
    "lastUserAgent" TEXT,
    "lastDevice" TEXT,
    "lastOs" TEXT,
    "lastLocale" TEXT,
    "lastReferrer" TEXT,
    "lastUtmSource" TEXT,
    "lastUtmMedium" TEXT,
    "lastUtmCampaign" TEXT,
    "lastUtmTerm" TEXT,
    "lastUtmContent" TEXT,
    "lastDeviceMemory" DOUBLE PRECISION,
    "lastDpr" DOUBLE PRECISION,
    "lastViewportWidth" INTEGER,
    "lastDownlink" DOUBLE PRECISION,
    "lastRtt" INTEGER,
    "lastEct" TEXT,
    "lastVisitedAt" TIMESTAMP(3),
    "currentBalance" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalDeposited" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalWithdrawn" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "telemetry" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "resolutionDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "result" TEXT,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "initialLiquidity" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "liquidityParameter" DOUBLE PRECISION NOT NULL DEFAULT 20000.0,
    "type" TEXT NOT NULL DEFAULT 'BINARY',
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "polymarketId" TEXT,
    "resolutionSource" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "externalVolume" DOUBLE PRECISION DEFAULT 0.0,
    "externalBetCount" INTEGER DEFAULT 0,
    "noOdds" DOUBLE PRECISION,
    "qNo" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "qYes" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rules" TEXT,
    "yesOdds" DOUBLE PRECISION,
    "searchVector" tsvector,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "resolutionDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BINARY',
    "outcomes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedEventId" TEXT,

    CONSTRAINT "EventSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "liquidity" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "polymarketMarketId" TEXT,
    "polymarketOutcomeId" TEXT,
    "source" TEXT,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsHistory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "polymarketTokenId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'POLYMARKET',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketActivity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "option" TEXT,
    "side" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "isAmmInteraction" BOOLEAN NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resourceId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "option" TEXT,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountFilled" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "orderType" TEXT NOT NULL DEFAULT 'limit',
    "visibleAmount" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION,
    "timeWindow" INTEGER,
    "totalDuration" INTEGER,
    "executedSlices" INTEGER NOT NULL DEFAULT 0,
    "stopPrice" DOUBLE PRECISION,
    "stopType" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "successfulOrders" INTEGER NOT NULL DEFAULT 0,
    "failedOrders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderExecution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "eventId" TEXT,
    "outcomeId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "locked" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceBefore" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "derivationIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "txHash" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "maxOrderSize" DOUBLE PRECISION NOT NULL DEFAULT 10000.0,
    "maxDailyVolume" DOUBLE PRECISION NOT NULL DEFAULT 100000.0,
    "dailyVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "dailyVolumeDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HedgePosition" (
    "id" TEXT NOT NULL,
    "userOrderId" TEXT NOT NULL,
    "polymarketOrderId" TEXT,
    "polymarketMarketId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "userPrice" DOUBLE PRECISION NOT NULL,
    "hedgePrice" DOUBLE PRECISION NOT NULL,
    "spreadCaptured" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "hedgedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "polymarketFees" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "gasCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "netProfit" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HedgePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolymarketMarketMapping" (
    "id" TEXT NOT NULL,
    "internalEventId" TEXT NOT NULL,
    "polymarketId" TEXT NOT NULL,
    "polymarketConditionId" TEXT,
    "polymarketTokenId" TEXT,
    "outcomeMapping" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "liquiditySnapshot" JSONB,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "updatedBy" TEXT,
    "decisionAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolymarketMarketMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolyOrder" (
    "id" TEXT NOT NULL,
    "userOrderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "polymarketOrderId" TEXT,
    "polymarketMarketId" TEXT NOT NULL,
    "polymarketOutcomeId" TEXT,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountFilled" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "placedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolyPosition" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "polymarketMarketId" TEXT NOT NULL,
    "polymarketOutcomeId" TEXT,
    "netExposure" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "hedgedExposure" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastHedgeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolyPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolySyncCursor" (
    "id" TEXT NOT NULL,
    "lastMarketUpdatedAt" TIMESTAMP(3),
    "lastCursor" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "PolySyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSnapshot" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalUnhedgedValue" DOUBLE PRECISION NOT NULL,
    "totalHedgedValue" DOUBLE PRECISION NOT NULL,
    "netExposure" DOUBLE PRECISION NOT NULL,
    "totalSpreadCaptured" DOUBLE PRECISION NOT NULL,
    "hedgeSuccessRate" DOUBLE PRECISION NOT NULL,
    "averageHedgeTime" INTEGER,
    "openPositionsCount" INTEGER NOT NULL,
    "failedHedgesCount" INTEGER NOT NULL,
    "marketExposure" JSONB NOT NULL,

    CONSTRAINT "RiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HedgeConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "HedgeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_address_idx" ON "User"("address");

-- CreateIndex
CREATE INDEX "User_lastVisitedAt_idx" ON "User"("lastVisitedAt");

-- CreateIndex
CREATE INDEX "User_lastCountry_idx" ON "User"("lastCountry");

-- CreateIndex
CREATE INDEX "User_lastCity_idx" ON "User"("lastCity");

-- CreateIndex
CREATE INDEX "User_lastRegion_idx" ON "User"("lastRegion");

-- CreateIndex
CREATE INDEX "TelemetryEvent_userId_createdAt_idx" ON "TelemetryEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_type_createdAt_idx" ON "TelemetryEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_polymarketId_key" ON "Event"("polymarketId");

-- CreateIndex
CREATE INDEX "Event_status_createdAt_idx" ON "Event"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Event_categories_idx" ON "Event" USING GIN ("categories");

-- CreateIndex
CREATE INDEX "Event_creatorId_idx" ON "Event"("creatorId");

-- CreateIndex
CREATE INDEX "Event_searchVector_idx" ON "Event" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "EventSuggestion_status_createdAt_idx" ON "EventSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EventSuggestion_userId_idx" ON "EventSuggestion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_polymarketOutcomeId_key" ON "Outcome"("polymarketOutcomeId");

-- CreateIndex
CREATE INDEX "Outcome_eventId_idx" ON "Outcome"("eventId");

-- CreateIndex
CREATE INDEX "Outcome_polymarketOutcomeId_idx" ON "Outcome"("polymarketOutcomeId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_eventId_name_key" ON "Outcome"("eventId", "name");

-- CreateIndex
CREATE INDEX "OddsHistory_polymarketTokenId_timestamp_idx" ON "OddsHistory"("polymarketTokenId", "timestamp");

-- CreateIndex
CREATE INDEX "OddsHistory_eventId_outcomeId_timestamp_idx" ON "OddsHistory"("eventId", "outcomeId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "OddsHistory_eventId_outcomeId_timestamp_key" ON "OddsHistory"("eventId", "outcomeId", "timestamp");

-- CreateIndex
CREATE INDEX "MarketActivity_eventId_idx" ON "MarketActivity"("eventId");

-- CreateIndex
CREATE INDEX "MarketActivity_userId_idx" ON "MarketActivity"("userId");

-- CreateIndex
CREATE INDEX "MarketActivity_createdAt_idx" ON "MarketActivity"("createdAt");

-- CreateIndex
CREATE INDEX "MarketActivity_orderId_idx" ON "MarketActivity"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_hash_key" ON "Transaction"("hash");

-- CreateIndex
CREATE INDEX "Message_eventId_createdAt_idx" ON "Message"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- CreateIndex
CREATE INDEX "Message_parentId_idx" ON "Message"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_userId_messageId_key" ON "MessageReaction"("userId", "messageId");

-- CreateIndex
CREATE INDEX "Order_eventId_side_idx" ON "Order"("eventId", "side");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_batchId_idx" ON "Order"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchOrder_idempotencyKey_key" ON "BatchOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BatchOrder_userId_idx" ON "BatchOrder"("userId");

-- CreateIndex
CREATE INDEX "BatchOrder_idempotencyKey_idx" ON "BatchOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BatchOrder_status_idx" ON "BatchOrder"("status");

-- CreateIndex
CREATE INDEX "OrderExecution_orderId_idx" ON "OrderExecution"("orderId");

-- CreateIndex
CREATE INDEX "OrderExecution_executedAt_idx" ON "OrderExecution"("executedAt");

-- CreateIndex
CREATE INDEX "Balance_userId_idx" ON "Balance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_tokenSymbol_eventId_outcomeId_key" ON "Balance"("userId", "tokenSymbol", "eventId", "outcomeId");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_idx" ON "LedgerEntry"("userId");

-- CreateIndex
CREATE INDEX "LedgerEntry_referenceType_referenceId_idx" ON "LedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountId_providerId_key" ON "Account"("accountId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactor_userId_key" ON "TwoFactor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_address_key" ON "DepositAddress"("address");

-- CreateIndex
CREATE INDEX "DepositAddress_address_idx" ON "DepositAddress"("address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_userId_currency_key" ON "DepositAddress"("userId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_txHash_key" ON "Deposit"("txHash");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_txHash_idx" ON "Deposit"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_idx" ON "Withdrawal"("userId");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_idx" ON "UserFavorite"("userId");

-- CreateIndex
CREATE INDEX "UserFavorite_eventId_idx" ON "UserFavorite"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_eventId_key" ON "UserFavorite"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalAccount_userId_key" ON "InstitutionalAccount"("userId");

-- CreateIndex
CREATE INDEX "InstitutionalAccount_userId_idx" ON "InstitutionalAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_accountId_idx" ON "ApiKey"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "HedgePosition_userOrderId_key" ON "HedgePosition"("userOrderId");

-- CreateIndex
CREATE INDEX "HedgePosition_status_idx" ON "HedgePosition"("status");

-- CreateIndex
CREATE INDEX "HedgePosition_createdAt_idx" ON "HedgePosition"("createdAt");

-- CreateIndex
CREATE INDEX "HedgePosition_polymarketMarketId_idx" ON "HedgePosition"("polymarketMarketId");

-- CreateIndex
CREATE INDEX "HedgePosition_hedgedAt_idx" ON "HedgePosition"("hedgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolymarketMarketMapping_internalEventId_key" ON "PolymarketMarketMapping"("internalEventId");

-- CreateIndex
CREATE INDEX "PolymarketMarketMapping_polymarketId_idx" ON "PolymarketMarketMapping"("polymarketId");

-- CreateIndex
CREATE INDEX "PolymarketMarketMapping_internalEventId_idx" ON "PolymarketMarketMapping"("internalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PolyOrder_userOrderId_key" ON "PolyOrder"("userOrderId");

-- CreateIndex
CREATE INDEX "PolyOrder_status_idx" ON "PolyOrder"("status");

-- CreateIndex
CREATE INDEX "PolyOrder_polymarketMarketId_idx" ON "PolyOrder"("polymarketMarketId");

-- CreateIndex
CREATE INDEX "PolyOrder_polymarketOutcomeId_idx" ON "PolyOrder"("polymarketOutcomeId");

-- CreateIndex
CREATE INDEX "PolyOrder_eventId_idx" ON "PolyOrder"("eventId");

-- CreateIndex
CREATE INDEX "PolyPosition_polymarketMarketId_idx" ON "PolyPosition"("polymarketMarketId");

-- CreateIndex
CREATE INDEX "PolyPosition_polymarketOutcomeId_idx" ON "PolyPosition"("polymarketOutcomeId");

-- CreateIndex
CREATE UNIQUE INDEX "PolyPosition_eventId_outcomeId_key" ON "PolyPosition"("eventId", "outcomeId");

-- CreateIndex
CREATE INDEX "RiskSnapshot_timestamp_idx" ON "RiskSnapshot"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "HedgeConfig_key_key" ON "HedgeConfig"("key");

-- CreateIndex
CREATE INDEX "HedgeConfig_key_idx" ON "HedgeConfig"("key");

-- AddForeignKey
ALTER TABLE "TelemetryEvent" ADD CONSTRAINT "TelemetryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSuggestion" ADD CONSTRAINT "EventSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsHistory" ADD CONSTRAINT "OddsHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsHistory" ADD CONSTRAINT "OddsHistory_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketActivity" ADD CONSTRAINT "MarketActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketActivity" ADD CONSTRAINT "MarketActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketActivity" ADD CONSTRAINT "MarketActivity_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketActivity" ADD CONSTRAINT "MarketActivity_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExecution" ADD CONSTRAINT "OrderExecution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalAccount" ADD CONSTRAINT "InstitutionalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstitutionalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HedgePosition" ADD CONSTRAINT "HedgePosition_userOrderId_fkey" FOREIGN KEY ("userOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolyOrder" ADD CONSTRAINT "PolyOrder_userOrderId_fkey" FOREIGN KEY ("userOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolyOrder" ADD CONSTRAINT "PolyOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolyOrder" ADD CONSTRAINT "PolyOrder_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolyPosition" ADD CONSTRAINT "PolyPosition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolyPosition" ADD CONSTRAINT "PolyPosition_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

