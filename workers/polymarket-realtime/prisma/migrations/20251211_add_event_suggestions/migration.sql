-- Create table for user-submitted event suggestions
CREATE TABLE IF NOT EXISTS "EventSuggestion" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "resolutionDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BINARY',
    "outcomes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "approvedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EventSuggestion_status_createdAt_idx" ON "EventSuggestion"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EventSuggestion_userId_idx" ON "EventSuggestion"("userId");

ALTER TABLE "EventSuggestion"
ADD CONSTRAINT "EventSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;





