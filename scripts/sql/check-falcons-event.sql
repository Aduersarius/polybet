-- Check current state of Falcons vs Xtreme event
SELECT 
  id,
  title,
  "startTime",
  live,
  "gameStatus",
  "eventType",
  "polymarketId",
  "createdAt",
  "updatedAt"
FROM "Event"
WHERE 
  LOWER(title) LIKE '%falcons%'
  AND LOWER(title) LIKE '%xtreme%'
ORDER BY "updatedAt" DESC;

