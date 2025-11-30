-- Create Payload CMS core tables
CREATE TABLE IF NOT EXISTS "payload_preferences" (
    "id" serial PRIMARY KEY,
    "key" varchar NOT NULL,
    "value" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
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

-- Create indexes
CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences"("key");
CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels"("parent_id");
CREATE INDEX IF NOT EXISTS "payload_preferences_rels_payload_users_idx" ON "payload_preferences_rels"("payload_users_id");

-- Insert default admin user (change password hash as needed)
-- Password hash for 'admin' - you should change this
INSERT INTO "payload_users" ("email", "password") VALUES ('admin@polybet.com', '$2a$10$8K1p/5w6QyTQJ8q.9L8qOeJc8QK8QK8QK8QK8QK8QK8QK8QK8QK8Q')
ON CONFLICT ("email") DO NOTHING;