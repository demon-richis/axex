-- Axex bot verification additive migration. Apply manually to a TEST Neon branch first.
CREATE TABLE IF NOT EXISTS global_bots (
  bot_id TEXT PRIMARY KEY CHECK (bot_id ~ '^[0-9]{17,20}$'),
  name TEXT,
  status TEXT NOT NULL CHECK (status IN ('verified', 'blocked', 'unverified')),
  source TEXT NOT NULL CHECK (source IN ('axex_curated', 'discord_verified')),
  discord_verified BOOLEAN,
  note TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS guild_bot_whitelist (
  guild_id TEXT NOT NULL,
  bot_id TEXT NOT NULL CHECK (bot_id ~ '^[0-9]{17,20}$'),
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, bot_id)
);
CREATE TABLE IF NOT EXISTS bot_verification_log (
  id BIGSERIAL PRIMARY KEY,
  case_code TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  bot_id TEXT NOT NULL CHECK (bot_id ~ '^[0-9]{17,20}$'),
  bot_name TEXT,
  result TEXT NOT NULL CHECK (result IN ('allowed','blocked','unverified','impersonation_suspect','error')),
  reason TEXT NOT NULL,
  added_by TEXT,
  permissions TEXT,
  original_permissions TEXT,
  dangerous_permissions TEXT[] NOT NULL DEFAULT '{}',
  action_taken TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bot_db_audit (
  seq BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  bot_id TEXT CHECK (bot_id IS NULL OR bot_id ~ '^[0-9]{17,20}$'),
  old_status TEXT,
  new_status TEXT,
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash TEXT,
  entry_hash TEXT NOT NULL
);
CREATE OR REPLACE FUNCTION axex_bot_db_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'bot_db_audit is append-only'; END;
$$;
DROP TRIGGER IF EXISTS bot_db_audit_no_update_delete ON bot_db_audit;
CREATE TRIGGER bot_db_audit_no_update_delete BEFORE UPDATE OR DELETE ON bot_db_audit
FOR EACH ROW EXECUTE FUNCTION axex_bot_db_audit_immutable();
CREATE OR REPLACE FUNCTION axex_bot_db_audit_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'bot_db_audit is append-only'; END;
$$;
DROP TRIGGER IF EXISTS bot_db_audit_no_truncate ON bot_db_audit;
CREATE TRIGGER bot_db_audit_no_truncate BEFORE TRUNCATE ON bot_db_audit
FOR EACH STATEMENT EXECUTE FUNCTION axex_bot_db_audit_no_truncate();
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS bot_verification_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS unverified_bot_action TEXT NOT NULL DEFAULT 'restrict' CHECK (unverified_bot_action IN ('alert','restrict','kick'));
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS blocked_bot_action TEXT NOT NULL DEFAULT 'ban' CHECK (blocked_bot_action IN ('alert','kick','ban'));
-- Apply with a migration transaction in Neon. These role statements are intentionally not run by Axex.
-- REVOKE INSERT, UPDATE, DELETE ON global_bots, bot_db_audit FROM axex_bot;
-- GRANT SELECT ON global_bots, bot_db_audit TO axex_bot;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON guild_bot_whitelist, bot_verification_log TO axex_bot;
-- GRANT USAGE, SELECT ON SEQUENCE bot_verification_log_id_seq TO axex_bot;
-- CREATE ROLE axex_admin_rw LOGIN PASSWORD '<GENERATE-IN-NEON>'; -- store only in encrypted botdb vault
-- GRANT SELECT, INSERT, UPDATE, DELETE ON global_bots TO axex_admin_rw;
-- GRANT INSERT ON bot_db_audit TO axex_admin_rw;
-- GRANT USAGE, SELECT ON SEQUENCE bot_db_audit_seq_seq TO axex_admin_rw;
