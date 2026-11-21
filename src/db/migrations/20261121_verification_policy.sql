-- Additive X0.2 verification policy migration. Apply to a TEST Neon branch first.
ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3
    CHECK (max_attempts BETWEEN 1 AND 10);

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS cooldown_seconds TEXT NOT NULL DEFAULT '180 / 10800';

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS review_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS review_timeout_hours INTEGER NOT NULL DEFAULT 24
    CHECK (review_timeout_hours BETWEEN 1 AND 168);

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS network_fail_mode TEXT NOT NULL DEFAULT 'closed'
    CHECK (network_fail_mode IN ('open', 'closed'));

ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS auto_verify_enabled BOOLEAN NOT NULL DEFAULT FALSE;
