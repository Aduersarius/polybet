-- Drop all Payload tables to recreate them properly
DROP TABLE IF EXISTS payload_preferences_rels CASCADE;
DROP TABLE IF EXISTS payload_preferences CASCADE;
DROP TABLE IF EXISTS payload_locked_documents_rels CASCADE;
DROP TABLE IF EXISTS payload_locked_documents CASCADE;
DROP TABLE IF EXISTS payload_migrations CASCADE;
DROP TABLE IF EXISTS payload_kv CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS _payload_events_v_version_categories CASCADE;
DROP TABLE IF EXISTS _payload_events_v CASCADE;
DROP TABLE IF EXISTS payload_events_categories CASCADE;
DROP TABLE IF EXISTS payload_events CASCADE;
DROP TABLE IF EXISTS payload_users_sessions CASCADE;
DROP TABLE IF EXISTS payload_users CASCADE;
