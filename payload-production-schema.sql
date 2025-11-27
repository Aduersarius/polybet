-- Payload CMS Database Schema for Production
-- Run this in your production PostgreSQL database

-- Users table (main auth collection)
CREATE TABLE IF NOT EXISTS payload_users (
  id SERIAL PRIMARY KEY,
  role VARCHAR(255) DEFAULT 'user',
  username VARCHAR(255),
  description TEXT,
  avatar_url_id INTEGER,
  social_twitter VARCHAR(500),
  social_discord VARCHAR(500),
  social_telegram VARCHAR(500),
  social_website VARCHAR(500),
  is_admin BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  clerk_id VARCHAR(255),
  address VARCHAR(255),
  prisma_id VARCHAR(255),
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  email VARCHAR(255) UNIQUE NOT NULL,
  reset_password_token VARCHAR(500),
  reset_password_expiration TIMESTAMP(3),
  salt VARCHAR(500),
  hash VARCHAR(500),
  login_attempts INTEGER DEFAULT 0,
  lock_until TIMESTAMP(3)
);

-- User sessions table
CREATE TABLE IF NOT EXISTS payload_users_sessions (
  _order INTEGER NOT NULL,
  _parent_id INTEGER NOT NULL REFERENCES payload_users(id) ON DELETE CASCADE,
  id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP(3) NOT NULL
);

-- Events table
CREATE TABLE IF NOT EXISTS payload_events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description JSONB,
  image_url_id INTEGER,
  resolution_date TIMESTAMP(3),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  result VARCHAR(50),
  is_hidden BOOLEAN DEFAULT false,
  rules TEXT,
  amm_liquidity_parameter NUMERIC DEFAULT 100,
  amm_initial_liquidity NUMERIC DEFAULT 100,
  prisma_id VARCHAR(255),
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  _status VARCHAR(50) DEFAULT 'published'
);

-- Event categories (array relationship)
CREATE TABLE IF NOT EXISTS payload_events_categories (
  _order INTEGER NOT NULL,
  _parent_id INTEGER NOT NULL REFERENCES payload_events(id) ON DELETE CASCADE,
  id SERIAL PRIMARY KEY,
  value VARCHAR(100)
);

-- Event versions (for draft support)
CREATE TABLE IF NOT EXISTS _payload_events_v (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES payload_events(id) ON DELETE SET NULL,
  version_title VARCHAR(500),
  version_description JSONB,
  version_image_url_id INTEGER,
  version_resolution_date TIMESTAMP(3),
  version_status VARCHAR(50),
  version_result VARCHAR(50),
  version_is_hidden BOOLEAN,
  version_rules TEXT,
  version_amm_liquidity_parameter NUMERIC,
  version_amm_initial_liquidity NUMERIC,
  version_prisma_id VARCHAR(255),
  version__status VARCHAR(50),
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  latest BOOLEAN,
  published_locale VARCHAR(10),
  autosave BOOLEAN
);

-- Event version categories
CREATE TABLE IF NOT EXISTS _payload_events_v_version_categories (
  _order INTEGER NOT NULL,
  _parent_id INTEGER NOT NULL REFERENCES _payload_events_v(id) ON DELETE CASCADE,
  id SERIAL PRIMARY KEY,
  value VARCHAR(100)
);

-- Media table
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  alt VARCHAR(500),
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  url VARCHAR(1000),
  thumbnail_u_r_l VARCHAR(1000),
  filename VARCHAR(500),
  mime_type VARCHAR(100),
  filesize INTEGER,
  width INTEGER,
  height INTEGER,
  focal_x NUMERIC,
  focal_y NUMERIC
);

-- Payload migrations table
CREATE TABLE IF NOT EXISTS payload_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) UNIQUE NOT NULL,
  batch INTEGER,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- Payload preferences
CREATE TABLE IF NOT EXISTS payload_preferences (
  id SERIAL PRIMARY KEY,
  key VARCHAR(500),
  value JSONB,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- Payload preferences relationships
CREATE TABLE IF NOT EXISTS payload_preferences_rels (
  id SERIAL PRIMARY KEY,
  order INTEGER,
  parent_id INTEGER REFERENCES payload_preferences(id) ON DELETE CASCADE,
  path VARCHAR(255) NOT NULL,
  users_id INTEGER REFERENCES payload_users(id) ON DELETE CASCADE
);

-- Payload locked documents
CREATE TABLE IF NOT EXISTS payload_locked_documents (
  id SERIAL PRIMARY KEY,
  global_slug VARCHAR(255),
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- Payload locked documents relationships
CREATE TABLE IF NOT EXISTS payload_locked_documents_rels (
  id SERIAL PRIMARY KEY,
  order INTEGER,
  parent_id INTEGER REFERENCES payload_locked_documents(id) ON DELETE CASCADE,
  path VARCHAR(255) NOT NULL,
  users_id INTEGER REFERENCES payload_users(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
  payload_events_id INTEGER REFERENCES payload_events(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS payload_users_email_idx ON payload_users(email);
CREATE INDEX IF NOT EXISTS payload_users_created_at_idx ON payload_users(created_at DESC);
CREATE INDEX IF NOT EXISTS payload_users_sessions_parent_idx ON payload_users_sessions(_parent_id);
CREATE INDEX IF NOT EXISTS payload_events_status_idx ON payload_events(status);
CREATE INDEX IF NOT EXISTS payload_events_created_at_idx ON payload_events(created_at DESC);
CREATE INDEX IF NOT EXISTS payload_events_categories_parent_idx ON payload_events_categories(_parent_id);
CREATE INDEX IF NOT EXISTS payload_preferences_key_idx ON payload_preferences(key);

-- Insert initial migration record
INSERT INTO payload_migrations (name, batch) 
VALUES ('initial_setup', 1)
ON CONFLICT (name) DO NOTHING;

COMMIT;
