-- Migration: Add support_manager role to supportRole field
-- This migration updates the supportRole field to include 'support_manager' as a valid value
-- Note: The schema.prisma file should be updated to reflect this change
-- The actual database constraint will be enforced by Prisma

-- No SQL changes needed as supportRole is a String? field
-- The validation happens at the application level
-- To apply this, run: npx prisma db push

