-- Performance Indexes Migration
-- Run this on your VPS database to add performance indexes

-- User indexes
CREATE INDEX IF NOT EXISTS "User_address_idx" ON "User"("address");

-- Event indexes
CREATE INDEX IF NOT EXISTS "Event_status_createdAt_idx" ON "Event"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_categories_idx" ON "Event" USING GIN ("categories");
CREATE INDEX IF NOT EXISTS "Event_creatorId_idx" ON "Event"("creatorId");

-- Bet indexes
CREATE INDEX IF NOT EXISTS "Bet_eventId_idx" ON "Bet"("eventId");
CREATE INDEX IF NOT EXISTS "Bet_userId_idx" ON "Bet"("userId");
CREATE INDEX IF NOT EXISTS "Bet_createdAt_idx" ON "Bet"("createdAt");

-- Message indexes
CREATE INDEX IF NOT EXISTS "Message_eventId_createdAt_idx" ON "Message"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_userId_idx" ON "Message"("userId");
CREATE INDEX IF NOT EXISTS "Message_parentId_idx" ON "Message"("parentId");

-- Verify indexes were created
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('User', 'Event', 'Bet', 'Message')
ORDER BY tablename, indexname;
