#!/bin/bash

# Apply the missing foreign key constraint to VPS database
# This fixes the polymarket-worker error

set -e

echo "🔧 Applying PolymarketMarketMapping->Event relation to VPS database..."
echo ""

# Database connection
DB_URL="postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed"
    echo "Install it with: brew install postgresql"
    exit 1
fi

# Test connection
echo "📡 Testing database connection..."
if ! psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Error: Cannot connect to database"
    echo "Check your network connection and credentials"
    exit 1
fi
echo "✅ Database connection OK"
echo ""

# Check if constraint already exists
echo "🔍 Checking if constraint already exists..."
CONSTRAINT_EXISTS=$(psql "$DB_URL" -tAc "
SELECT COUNT(*) 
FROM information_schema.table_constraints 
WHERE table_name = 'PolymarketMarketMapping' 
AND constraint_name = 'PolymarketMarketMapping_internalEventId_fkey'
")

if [ "$CONSTRAINT_EXISTS" -gt 0 ]; then
    echo "✅ Constraint already exists. Nothing to do!"
    exit 0
fi

echo "📝 Constraint does not exist. Applying migration..."
echo ""

# Apply the migration
psql "$DB_URL" << EOF
-- Add foreign key constraint
ALTER TABLE "PolymarketMarketMapping" 
ADD CONSTRAINT "PolymarketMarketMapping_internalEventId_fkey" 
FOREIGN KEY ("internalEventId") REFERENCES "Event"("id") 
ON DELETE RESTRICT ON UPDATE CASCADE;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "📋 Verifying constraint..."
    psql "$DB_URL" -c "\d \"PolymarketMarketMapping\"" | grep -A 2 "Foreign-key constraints"
    echo ""
    echo "🎉 Done! Now rebuild the polymarket-worker container in Coolify."
    echo ""
    echo "Next steps:"
    echo "  1. Go to Coolify dashboard"
    echo "  2. Find the polymarket-worker container"
    echo "  3. Click 'Redeploy' to rebuild with updated Prisma client"
    echo "  4. Check logs - the error should be gone!"
else
    echo ""
    echo "❌ Migration failed!"
    echo "Check the error above for details."
    exit 1
fi
