-- Create Payload CMS tables manually
-- This creates the minimum tables needed for Payload to function

CREATE TABLE IF NOT EXISTS payload_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  salt VARCHAR(255),
  reset_password_token VARCHAR(255),
  reset_password_expiration TIMESTAMP,
  login_attempts INTEGER DEFAULT 0,
  lock_until TIMESTAMP,
  role VARCHAR(50) DEFAULT 'user',
  username VARCHAR(255),
  description TEXT,
  "avatarUrl" VARCHAR(500),
  "isAdmin" BOOLEAN DEFAULT false,
  "isBanned" BOOLEAN DEFAULT false,
  "clerkId" VARCHAR(255),
  address VARCHAR(255),
  "prismaId" VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_users_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES payload_users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  "imageUrl" VARCHAR(500),
  "resolutionDate" TIMESTAMP,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  result VARCHAR(50),
  "isHidden" BOOLEAN DEFAULT false,
  rules TEXT,
  "liquidityParameter" DECIMAL DEFAULT 100,
  "initialLiquidity" DECIMAL DEFAULT 100,
  "prismaId" VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_events_categories (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES payload_events(id) ON DELETE CASCADE,
  "order" INTEGER,
  value VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS _payload_events_v (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES payload_events(id) ON DELETE SET NULL,
  version_title VARCHAR(500),
  version_description TEXT,
  version_image_url VARCHAR(500),
  version_resolution_date TIMESTAMP,
  version_status VARCHAR(50),
  version_result VARCHAR(50),
  version_is_hidden BOOLEAN,
  version_rules TEXT,
  version_liquidity_parameter DECIMAL,
  version_initial_liquidity DECIMAL,
  version_prisma_id VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS _payload_events_v_version_categories (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES _payload_events_v(id) ON DELETE CASCADE,
  "order" INTEGER,
  value VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  alt VARCHAR(500),
  filename VARCHAR(500),
  mime_type VARCHAR(100),
  filesize INTEGER,
  width INTEGER,
  height INTEGER,
  url VARCHAR(1000),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_kv (
  key VARCHAR(500) PRIMARY KEY,
  value JSONB,
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_locked_documents (
  id SERIAL PRIMARY KEY,
  global_slug VARCHAR(255),
  "collectionSlug" VARCHAR(255),
  "documentId" VARCHAR(255),
  user_id INTEGER REFERENCES payload_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_locked_documents_rels (
  id SERIAL PRIMARY KEY,
  "lockedDocId" INTEGER REFERENCES payload_locked_documents(id) ON DELETE CASCADE,
  "relatedDocId" VARCHAR(255),
  "relatedCollection" VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS payload_preferences (
  id SERIAL PRIMARY KEY,
  key VARCHAR(500) UNIQUE,
  value JSONB,
  user_id INTEGER REFERENCES payload_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payload_preferences_rels (
  id SERIAL PRIMARY KEY,
  "preferenceId" INTEGER REFERENCES payload_preferences(id) ON DELETE CASCADE,
  "relatedDocId" VARCHAR(255),
  "relatedCollection" VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS payload_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) UNIQUE NOT NULL,
  batch INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS payload_users_email_idx ON payload_users(email);
CREATE INDEX IF NOT EXISTS payload_events_status_idx ON payload_events(status);
CREATE INDEX IF NOT EXISTS payload_events_categories_parent_idx ON payload_events_categories(parent_id);
