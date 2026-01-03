-- Add missing columns to payload_locked_documents_rels table
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "payload_users_id" INTEGER;
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "app_users_id" INTEGER;
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "payload_events_id" INTEGER;
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_id" INTEGER;

-- Check the columns
SELECT column_name FROM information_schema.columns WHERE table_name = 'payload_locked_documents_rels' ORDER BY column_name;