CREATE TABLE IF NOT EXISTS guild_config (
  guild_id              TEXT PRIMARY KEY,
  verify_channel_id     TEXT,
  quarantine_channel_id TEXT,
  log_channel_id        TEXT,
  verified_role_id      TEXT,
  unverified_role_id    TEXT,
  quarantined_role_id   TEXT,
  member_role_ids       TEXT[] DEFAULT '{}'::TEXT[],
  verify_timeout        INTEGER DEFAULT 60,
  min_account_age       INTEGER DEFAULT 7,
  raid_threshold        INTEGER DEFAULT 10,
  raid_age              INTEGER DEFAULT 30,
  raid_timing           INTEGER DEFAULT 2500,
  honeypot_enabled      BOOLEAN DEFAULT TRUE,
  vpn_check_enabled     BOOLEAN DEFAULT TRUE,
  new_account_action    TEXT DEFAULT 'warn',
  suspicious_action     TEXT DEFAULT 'flag',
  panel_message_id      TEXT,
  setup_done            BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS member_role_ids TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS verify_timeout INTEGER DEFAULT 60;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS min_account_age INTEGER DEFAULT 7;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS raid_threshold INTEGER DEFAULT 10;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS raid_age INTEGER DEFAULT 30;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS raid_timing INTEGER DEFAULT 2500;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS honeypot_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS vpn_check_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS new_account_action TEXT DEFAULT 'warn';

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS suspicious_action TEXT DEFAULT 'flag';

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS panel_message_id TEXT;

CREATE TABLE IF NOT EXISTS quarantine_log (
  id          SERIAL PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  click_ms    INTEGER,
  account_age INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_events (
  id           SERIAL PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  username     TEXT NOT NULL,
  action       TEXT NOT NULL,
  reason       TEXT,
  click_ms     INTEGER,
  account_age  INTEGER,
  ip_flagged   BOOLEAN DEFAULT FALSE,
  raid_mode    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quarantine_queue (
  id           SERIAL PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  username     TEXT NOT NULL,
  reason       TEXT NOT NULL,
  click_ms     INTEGER,
  account_age  INTEGER,
  status       TEXT DEFAULT 'pending',
  handled_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_state (
  guild_id        TEXT PRIMARY KEY,
  raid_mode       BOOLEAN DEFAULT FALSE,
  event_mode      BOOLEAN DEFAULT FALSE,
  event_mode_ends TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
