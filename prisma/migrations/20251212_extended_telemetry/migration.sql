-- Add new telemetry detail columns to User
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "lastRegion" TEXT,
    ADD COLUMN IF NOT EXISTS "lastCity" TEXT,
    ADD COLUMN IF NOT EXISTS "lastTimezone" TEXT,
    ADD COLUMN IF NOT EXISTS "lastAsn" INTEGER,
    ADD COLUMN IF NOT EXISTS "lastIsp" TEXT,
    ADD COLUMN IF NOT EXISTS "lastLocale" TEXT,
    ADD COLUMN IF NOT EXISTS "lastReferrer" TEXT,
    ADD COLUMN IF NOT EXISTS "lastUtmSource" TEXT,
    ADD COLUMN IF NOT EXISTS "lastUtmMedium" TEXT,
    ADD COLUMN IF NOT EXISTS "lastUtmCampaign" TEXT,
    ADD COLUMN IF NOT EXISTS "lastUtmTerm" TEXT,
    ADD COLUMN IF NOT EXISTS "lastUtmContent" TEXT,
    ADD COLUMN IF NOT EXISTS "lastDeviceMemory" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "lastDpr" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "lastViewportWidth" INTEGER,
    ADD COLUMN IF NOT EXISTS "lastDownlink" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "lastRtt" INTEGER,
    ADD COLUMN IF NOT EXISTS "lastEct" TEXT;

-- Secondary indexes for new geo fields
CREATE INDEX IF NOT EXISTS "User_lastCity_idx" ON "User"("lastCity");
CREATE INDEX IF NOT EXISTS "User_lastRegion_idx" ON "User"("lastRegion");

-- TelemetryEvent table
CREATE TABLE IF NOT EXISTS "TelemetryEvent" (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TelemetryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TelemetryEvent_userId_createdAt_idx" ON "TelemetryEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_type_createdAt_idx" ON "TelemetryEvent"("type", "createdAt");
