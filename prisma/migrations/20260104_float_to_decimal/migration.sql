-- Migration: Float to Decimal for monetary values
-- This migration converts Float columns to Decimal for better precision in financial calculations
-- WARNING: This migration should be run during low-traffic periods as it modifies core trading tables

-- ============================================
-- PHASE 1: MarketActivity (High Priority - affects trading history)
-- ============================================

-- Convert amount and price to DECIMAL(18,8) for sufficient precision
ALTER TABLE "MarketActivity" 
    ALTER COLUMN "amount" TYPE DECIMAL(18,8) USING "amount"::DECIMAL(18,8),
    ALTER COLUMN "price" TYPE DECIMAL(18,8) USING "price"::DECIMAL(18,8);

-- ============================================
-- PHASE 2: Transaction (High Priority - affects transaction history)
-- ============================================

ALTER TABLE "Transaction" 
    ALTER COLUMN "amount" TYPE DECIMAL(18,8) USING "amount"::DECIMAL(18,8);

-- ============================================
-- PHASE 3: Order (High Priority - affects active orders)
-- ============================================

ALTER TABLE "Order" 
    ALTER COLUMN "price" TYPE DECIMAL(18,8) USING "price"::DECIMAL(18,8),
    ALTER COLUMN "amount" TYPE DECIMAL(18,8) USING "amount"::DECIMAL(18,8),
    ALTER COLUMN "amountFilled" TYPE DECIMAL(18,8) USING "amountFilled"::DECIMAL(18,8),
    ALTER COLUMN "visibleAmount" TYPE DECIMAL(18,8) USING "visibleAmount"::DECIMAL(18,8),
    ALTER COLUMN "totalAmount" TYPE DECIMAL(18,8) USING "totalAmount"::DECIMAL(18,8),
    ALTER COLUMN "stopPrice" TYPE DECIMAL(18,8) USING "stopPrice"::DECIMAL(18,8);

-- ============================================
-- PHASE 4: OrderExecution (High Priority - affects trade history)
-- ============================================

ALTER TABLE "OrderExecution" 
    ALTER COLUMN "amount" TYPE DECIMAL(18,8) USING "amount"::DECIMAL(18,8),
    ALTER COLUMN "price" TYPE DECIMAL(18,8) USING "price"::DECIMAL(18,8);

-- ============================================
-- PHASE 5: InstitutionalAccount (Medium Priority)
-- ============================================

ALTER TABLE "InstitutionalAccount" 
    ALTER COLUMN "maxOrderSize" TYPE DECIMAL(18,8) USING "maxOrderSize"::DECIMAL(18,8),
    ALTER COLUMN "maxDailyVolume" TYPE DECIMAL(18,8) USING "maxDailyVolume"::DECIMAL(18,8),
    ALTER COLUMN "dailyVolume" TYPE DECIMAL(18,8) USING "dailyVolume"::DECIMAL(18,8);

-- ============================================
-- PHASE 6: HedgePosition (Medium Priority - affects hedging)
-- ============================================

ALTER TABLE "HedgePosition" 
    ALTER COLUMN "amount" TYPE DECIMAL(18,8) USING "amount"::DECIMAL(18,8),
    ALTER COLUMN "userPrice" TYPE DECIMAL(18,8) USING "userPrice"::DECIMAL(18,8),
    ALTER COLUMN "hedgePrice" TYPE DECIMAL(18,8) USING "hedgePrice"::DECIMAL(18,8),
    ALTER COLUMN "spreadCaptured" TYPE DECIMAL(18,8) USING "spreadCaptured"::DECIMAL(18,8),
    ALTER COLUMN "polymarketFees" TYPE DECIMAL(18,8) USING "polymarketFees"::DECIMAL(18,8),
    ALTER COLUMN "gasCost" TYPE DECIMAL(18,8) USING "gasCost"::DECIMAL(18,8),
    ALTER COLUMN "netProfit" TYPE DECIMAL(18,8) USING "netProfit"::DECIMAL(18,8);

-- ============================================
-- PHASE 7: PolyOrder (Medium Priority - affects Polymarket integration)
-- ============================================

ALTER TABLE "PolyOrder" 
    ALTER COLUMN "price" TYPE DECIMAL(18,8) USING "price"::DECIMAL(18,8),
    ALTER COLUMN "amount" TYPE DECIMAL(18,8) USING "amount"::DECIMAL(18,8),
    ALTER COLUMN "amountFilled" TYPE DECIMAL(18,8) USING "amountFilled"::DECIMAL(18,8);

-- ============================================
-- PHASE 8: PolyPosition (Medium Priority - affects position tracking)
-- ============================================

ALTER TABLE "PolyPosition" 
    ALTER COLUMN "netExposure" TYPE DECIMAL(18,8) USING "netExposure"::DECIMAL(18,8),
    ALTER COLUMN "hedgedExposure" TYPE DECIMAL(18,8) USING "hedgedExposure"::DECIMAL(18,8);

-- ============================================
-- PHASE 9: RiskSnapshot (Low Priority - analytics only)
-- ============================================

ALTER TABLE "RiskSnapshot" 
    ALTER COLUMN "totalUnhedgedValue" TYPE DECIMAL(18,8) USING "totalUnhedgedValue"::DECIMAL(18,8),
    ALTER COLUMN "totalHedgedValue" TYPE DECIMAL(18,8) USING "totalHedgedValue"::DECIMAL(18,8),
    ALTER COLUMN "netExposure" TYPE DECIMAL(18,8) USING "netExposure"::DECIMAL(18,8),
    ALTER COLUMN "totalSpreadCaptured" TYPE DECIMAL(18,8) USING "totalSpreadCaptured"::DECIMAL(18,8),
    ALTER COLUMN "hedgeSuccessRate" TYPE DECIMAL(18,8) USING "hedgeSuccessRate"::DECIMAL(18,8);
