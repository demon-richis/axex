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
  reference_id TEXT,
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  click_ms    INTEGER,
  account_age INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quarantine_log ADD COLUMN IF NOT EXISTS reference_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS quarantine_log_reference_unique_idx
  ON quarantine_log (reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS verification_events (
  id           SERIAL PRIMARY KEY,
  event_id     TEXT UNIQUE,
  reference_id TEXT,
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

ALTER TABLE verification_events ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE verification_events ADD COLUMN IF NOT EXISTS reference_id TEXT;
CREATE INDEX IF NOT EXISTS verification_events_reference_idx ON verification_events (guild_id, reference_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_callback_receipts (
  reference_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'retryable', 'completed')),
  claim_id TEXT NOT NULL,
  lease_until TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS role_update_retries (
  id              SERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  reference_id    TEXT,
  target_role_id  TEXT NOT NULL,
  remove_role_id  TEXT,
  attempt_count   INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT DEFAULT 'pending',
  last_error      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS role_update_retries_pending_idx
  ON role_update_retries (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS quarantine_cases (
  id             SERIAL PRIMARY KEY,
  guild_id       TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  username       TEXT NOT NULL,
  reference_id   TEXT,
  reason         TEXT NOT NULL,
  click_ms       INTEGER,
  account_age    INTEGER,
  status         TEXT DEFAULT 'active' NOT NULL,
  moderator_id   TEXT,
  moderator_note TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quarantine_cases_active_idx
  ON quarantine_cases (guild_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS quarantine_cases_user_idx
  ON quarantine_cases (guild_id, user_id, status);

CREATE TABLE IF NOT EXISTS guild_state (
  guild_id        TEXT PRIMARY KEY,
  raid_mode       BOOLEAN DEFAULT FALSE,
  event_mode      BOOLEAN DEFAULT FALSE,
  event_mode_ends TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;
