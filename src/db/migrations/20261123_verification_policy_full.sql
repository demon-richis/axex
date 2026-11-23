ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS cooldown_seconds_1 INTEGER,
  ADD COLUMN IF NOT EXISTS cooldown_seconds_2 INTEGER,
  ADD COLUMN IF NOT EXISTS vpn_action TEXT,
  ADD COLUMN IF NOT EXISTS honeypot_action TEXT,
  ADD COLUMN IF NOT EXISTS new_account_days INTEGER,
  ADD COLUMN IF NOT EXISTS raid_action TEXT,
  ADD COLUMN IF NOT EXISTS captcha_provider TEXT,
  ADD COLUMN IF NOT EXISTS orbit_difficulty TEXT;

UPDATE guild_config
SET cooldown_seconds_1 = CASE
      WHEN trim(split_part(COALESCE(cooldown_seconds, ''), '/', 1)) ~ '^[0-9]{1,6}$'
        THEN LEAST(86400, trim(split_part(cooldown_seconds, '/', 1))::integer)
      ELSE 180
    END
WHERE cooldown_seconds_1 IS NULL;

UPDATE guild_config
SET cooldown_seconds_2 = CASE
      WHEN trim(split_part(COALESCE(cooldown_seconds, ''), '/', 2)) ~ '^[0-9]{1,6}$'
        THEN LEAST(86400, trim(split_part(cooldown_seconds, '/', 2))::integer)
      ELSE 10800
    END
WHERE cooldown_seconds_2 IS NULL;

UPDATE guild_config
SET vpn_action = CASE WHEN vpn_check_enabled = FALSE THEN 'allow' ELSE 'block' END
WHERE vpn_action IS NULL;

UPDATE guild_config
SET honeypot_action = CASE WHEN honeypot_enabled = FALSE THEN 'flag' ELSE 'quarantine' END
WHERE honeypot_action IS NULL;

UPDATE guild_config
SET new_account_days = LEAST(365, GREATEST(0, COALESCE(min_account_age, 7)))
WHERE new_account_days IS NULL;

UPDATE guild_config
SET raid_action = CASE
      WHEN suspicious_action = 'quarantine' THEN 'force_review_new_accounts'
      ELSE 'flag'
    END
WHERE raid_action IS NULL;

UPDATE guild_config
SET captcha_provider = 'turnstile'
WHERE captcha_provider IS NULL;

UPDATE guild_config
SET orbit_difficulty = 'high'
WHERE orbit_difficulty IS NULL;

ALTER TABLE guild_config
  ALTER COLUMN cooldown_seconds_1 SET DEFAULT 180,
  ALTER COLUMN cooldown_seconds_1 SET NOT NULL,
  ALTER COLUMN cooldown_seconds_2 SET DEFAULT 10800,
  ALTER COLUMN cooldown_seconds_2 SET NOT NULL,
  ALTER COLUMN vpn_action SET DEFAULT 'block',
  ALTER COLUMN vpn_action SET NOT NULL,
  ALTER COLUMN honeypot_action SET DEFAULT 'quarantine',
  ALTER COLUMN honeypot_action SET NOT NULL,
  ALTER COLUMN new_account_days SET DEFAULT 7,
  ALTER COLUMN new_account_days SET NOT NULL,
  ALTER COLUMN raid_action SET DEFAULT 'flag',
  ALTER COLUMN raid_action SET NOT NULL,
  ALTER COLUMN captcha_provider SET DEFAULT 'turnstile',
  ALTER COLUMN captcha_provider SET NOT NULL,
  ALTER COLUMN orbit_difficulty SET DEFAULT 'high',
  ALTER COLUMN orbit_difficulty SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_cooldown_seconds_1_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_cooldown_seconds_1_check CHECK (cooldown_seconds_1 BETWEEN 0 AND 86400);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_cooldown_seconds_2_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_cooldown_seconds_2_check CHECK (cooldown_seconds_2 BETWEEN 0 AND 86400);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_vpn_action_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_vpn_action_check CHECK (vpn_action IN ('allow', 'flag', 'challenge', 'block'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_honeypot_action_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_honeypot_action_check CHECK (honeypot_action IN ('flag', 'quarantine', 'kick', 'ban'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_new_account_days_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_new_account_days_check CHECK (new_account_days BETWEEN 0 AND 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_raid_action_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_raid_action_check CHECK (raid_action IN ('flag', 'force_review_new_accounts', 'stricter_attempts'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_captcha_provider_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_captcha_provider_check CHECK (captcha_provider IN ('turnstile', 'orbit', 'auto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guild_config_orbit_difficulty_check' AND conrelid = 'public.guild_config'::regclass) THEN
    ALTER TABLE guild_config ADD CONSTRAINT guild_config_orbit_difficulty_check CHECK (orbit_difficulty IN ('medium', 'high', 'extreme'));
  END IF;
END $$;
