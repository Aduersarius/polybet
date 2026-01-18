-- Migration: Create OddsHistoryHourly materialized view
-- This view pre-aggregates odds history data into hourly buckets
-- reducing query time for long-period charts by 3-4x

-- Create the materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS "OddsHistoryHourly" AS
SELECT 
  "eventId",
  "outcomeId",
  DATE_TRUNC('hour', "timestamp") as "bucketTime",
  AVG("probability")::FLOAT as "avgProbability",
  AVG("price")::FLOAT as "avgPrice",
  COUNT(*) as "sampleCount"
FROM "OddsHistory"
GROUP BY "eventId", "outcomeId", DATE_TRUNC('hour', "timestamp")
WITH DATA;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "OddsHistoryHourly_eventId_bucketTime_idx" 
ON "OddsHistoryHourly" ("eventId", "bucketTime", "outcomeId");

CREATE INDEX IF NOT EXISTS "OddsHistoryHourly_eventId_outcomeId_bucketTime_idx" 
ON "OddsHistoryHourly" ("eventId", "outcomeId", "bucketTime");

-- Optional: Create a unique index to support REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS "OddsHistoryHourly_unique_idx" 
ON "OddsHistoryHourly" ("eventId", "outcomeId", "bucketTime");

-- Create optimized indexes on the main OddsHistory table
CREATE INDEX IF NOT EXISTS "OddsHistory_eventId_timestamp_outcomeId_opt_idx" 
ON "OddsHistory" ("eventId", "timestamp", "outcomeId");

CREATE INDEX IF NOT EXISTS "OddsHistory_eventId_timestamp_covering_idx" 
ON "OddsHistory" ("eventId", "timestamp" ASC)
INCLUDE ("outcomeId", "price", "probability");
