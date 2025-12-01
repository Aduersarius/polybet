-- Create Payload CMS core tables
CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
    "id" serial PRIMARY KEY,
    "global_slug" varchar,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payload_locked_documents__rels" (
    "id" serial PRIMARY KEY,
    "parent_id" integer REFERENCES "payload_locked_documents"("id") ON DELETE CASCADE,
    "path" varchar NOT NULL,
    "payload_users_id" integer,
    "app_users_id" integer,
    "payload_events_id" integer,
    "media_id" integer,
    "order" integer,
    "locale" varchar
);

CREATE TABLE IF NOT EXISTS "payload_preferences" (
    "id" serial PRIMARY KEY,
    "key" varchar NOT NULL,
    "value" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payload_preferences__rels" (
    "id" serial PRIMARY KEY,
    "parent_id" integer REFERENCES "payload_preferences"("id") ON DELETE CASCADE,
    "path" varchar NOT NULL,
    "payload_users_id" integer,
    "order" integer,
    "locale" varchar
);

CREATE TABLE IF NOT EXISTS "payload_users" (
    "id" serial PRIMARY KEY,
    "email" varchar UNIQUE NOT NULL,
    "password" varchar,
    "reset_password_token" varchar,
    "reset_password_expires" timestamp with time zone,
    "login_attempts" integer DEFAULT 0,
    "lock_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add missing columns to existing payload_users table
ALTER TABLE "payload_users" ADD COLUMN IF NOT EXISTS "password" varchar;
ALTER TABLE "payload_users" ADD COLUMN IF NOT EXISTS "reset_password_token" varchar;
ALTER TABLE "payload_users" ADD COLUMN IF NOT EXISTS "reset_password_expires" timestamp with time zone;
ALTER TABLE "payload_users" ADD COLUMN IF NOT EXISTS "login_attempts" integer DEFAULT 0;
ALTER TABLE "payload_users" ADD COLUMN IF NOT EXISTS "lock_until" timestamp with time zone;

-- Add missing columns to existing tables (in case they were created with wrong schema)
ALTER TABLE "payload_locked_documents__rels" ADD COLUMN IF NOT EXISTS "payload_users_id" integer;
ALTER TABLE "payload_locked_documents__rels" ADD COLUMN IF NOT EXISTS "app_users_id" integer;
ALTER TABLE "payload_locked_documents__rels" ADD COLUMN IF NOT EXISTS "payload_events_id" integer;
ALTER TABLE "payload_locked_documents__rels" ADD COLUMN IF NOT EXISTS "media_id" integer;

ALTER TABLE "payload_preferences__rels" ADD COLUMN IF NOT EXISTS "payload_users_id" integer;

-- Create indexes
CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents"("global_slug");
CREATE INDEX IF NOT EXISTS "payload_locked_documents__rels_parent_idx" ON "payload_locked_documents__rels"("parent_id");
CREATE INDEX IF NOT EXISTS "payload_locked_documents__rels_payload_users_idx" ON "payload_locked_documents__rels"("payload_users_id");
CREATE INDEX IF NOT EXISTS "payload_locked_documents__rels_app_users_idx" ON "payload_locked_documents__rels"("app_users_id");
CREATE INDEX IF NOT EXISTS "payload_locked_documents__rels_payload_events_idx" ON "payload_locked_documents__rels"("payload_events_id");
CREATE INDEX IF NOT EXISTS "payload_locked_documents__rels_media_idx" ON "payload_locked_documents__rels"("media_id");

CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences"("key");
CREATE INDEX IF NOT EXISTS "payload_preferences__rels_parent_idx" ON "payload_preferences__rels"("parent_id");
CREATE INDEX IF NOT EXISTS "payload_preferences__rels_payload_users_idx" ON "payload_preferences__rels"("payload_users_id");

-- Insert default admin user (change password hash as needed)
-- Password hash for 'admin' - you should change this
INSERT INTO "payload_users" ("email", "password") VALUES ('admin@polybet.com', '$2a$10$8K1p/5w6QyTQJ8q.9L8qOeJc8QK8QK8QK8QK8QK8QK8QK8QK8QK8Q')
ON CONFLICT ("email") DO NOTHING;