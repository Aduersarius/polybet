-- Phase 2: Performance Optimization Indexes
-- Run this migration after deploying the code changes

-- Index for messages pagination (event + created date)
-- Speeds up: GET /api/events/[id]/messages with cursor-based pagination
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_event_created 
ON "Message" ("eventId", "createdAt" DESC) 
WHERE "isDeleted" = false;

-- Index for bet queries (event + created date)
-- Speeds up: GET /api/events/[id]/bets with pagination
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_event_created 
ON "Bet" ("eventId", "createdAt" DESC);

-- Composite index for event searches and filtering
-- Speeds up: GET /api/events with category filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_status_category_created 
ON "Event" ("status", "categories", "createdAt" DESC);

-- Index for AMM state lookups (critical for bets)
-- Speeds up: Frequent reads of qYes, qNo, liquidityParameter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_amm_state 
ON "Event" ("id", "qYes", "qNo", "liquidityParameter", "status")
WHERE "status" = 'ACTIVE';

-- Index for event details page
-- Speeds up: GET /api/events/[id] single record lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_id_active 
ON "Event" ("id") 
WHERE "status" = 'ACTIVE';

-- Verify indexes were created
SELECT 
    indexname, 
    tablename, 
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
