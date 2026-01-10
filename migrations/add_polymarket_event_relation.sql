-- Add foreign key constraint for PolymarketMarketMapping -> Event relation
-- This allows the worker to use `include: { event: { include: { outcomes: true } } }`

-- AddForeignKey
ALTER TABLE "PolymarketMarketMapping" 
ADD CONSTRAINT "PolymarketMarketMapping_internalEventId_fkey" 
FOREIGN KEY ("internalEventId") REFERENCES "Event"("id") 
ON DELETE RESTRICT ON UPDATE CASCADE;
