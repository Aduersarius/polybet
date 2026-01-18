-- Optimization: Add missing high-impact indexes
-- These indexes target frequent query patterns for user history, admin queues, and deposit detection

-- 1. Optimized Transaction History
-- Speed up "My Transactions" page which acts as the main ledger view
CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" 
ON "Transaction" ("userId", "createdAt" DESC);

-- 2. Optimized Order Management
-- Speed up fetching "Open Orders" and "Order History" for users
CREATE INDEX IF NOT EXISTS "Order_userId_status_createdAt_idx" 
ON "Order" ("userId", "status", "createdAt" DESC);

-- 3. Deposit Detection Optimization
-- Speed up checking for pending deposits on user addresses
CREATE INDEX IF NOT EXISTS "Deposit_toAddress_status_idx" 
ON "Deposit" ("toAddress", "status");

-- 4. Withdrawal Queue Optimization
-- Speed up the admin withdrawal approval dashboard
-- Ensures admins see oldest pending withdrawals first
CREATE INDEX IF NOT EXISTS "Withdrawal_status_createdAt_idx" 
ON "Withdrawal" ("status", "createdAt" ASC);

-- 5. Market Activity Feeds
-- Speed up filtering activity by user and event context
CREATE INDEX IF NOT EXISTS "MarketActivity_userId_eventId_idx" 
ON "MarketActivity" ("userId", "eventId");

-- 6. Support Ticket Dashboard Optimization
-- Replace scattered single-column indexes with a composite one for the common dashboard filter
CREATE INDEX IF NOT EXISTS "SupportTicket_status_priority_createdAt_idx" 
ON "SupportTicket" ("status", "priority", "createdAt" DESC);
