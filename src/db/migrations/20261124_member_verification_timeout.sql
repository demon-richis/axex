ALTER TABLE guild_config
  ADD COLUMN IF NOT EXISTS verification_timeout_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS verification_reminder_minutes INTEGER;

UPDATE guild_config
SET verification_timeout_minutes = 0
WHERE verification_timeout_minutes IS NULL;

UPDATE guild_config
SET verification_reminder_minutes = 30
WHERE verification_reminder_minutes IS NULL;

ALTER TABLE guild_config
  ALTER COLUMN verification_timeout_minutes SET DEFAULT 0,
  ALTER COLUMN verification_timeout_minutes SET NOT NULL,
  ALTER COLUMN verification_reminder_minutes SET DEFAULT 30,
  ALTER COLUMN verification_reminder_minutes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guild_config_verification_timeout_minutes_check'
      AND conrelid = 'public.guild_config'::regclass
  ) THEN
    ALTER TABLE guild_config
      ADD CONSTRAINT guild_config_verification_timeout_minutes_check
      CHECK (verification_timeout_minutes BETWEEN 0 AND 10080);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guild_config_verification_reminder_minutes_check'
      AND conrelid = 'public.guild_config'::regclass
  ) THEN
    ALTER TABLE guild_config
      ADD CONSTRAINT guild_config_verification_reminder_minutes_check
      CHECK (verification_reminder_minutes BETWEEN 1 AND 10079);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guild_config_verification_timeout_reminder_order_check'
      AND conrelid = 'public.guild_config'::regclass
  ) THEN
    ALTER TABLE guild_config
      ADD CONSTRAINT guild_config_verification_timeout_reminder_order_check
      CHECK (
        verification_timeout_minutes = 0
        OR verification_reminder_minutes < verification_timeout_minutes
      );
  END IF;
END $$;
