# Bot database setup

Run the additive migration in `src/db/migrations/20261112_bot_verification.sql` on a TEST Neon branch first. Create a restricted `axex_bot` role with SELECT only on `global_bots` and `bot_db_audit`, plus normal access to `guild_bot_whitelist` and `bot_verification_log`. Create `axex_admin_rw` separately with write access only to `global_bots` and INSERT access to `bot_db_audit`. Store the bot connection string as the existing `DATABASE_URL`; the admin connection string is entered by `scripts/botdb setup` and is stored only in the encrypted `.env.admin` vault.

Never run the migration or tool against production during development. The bot never writes `global_bots`. The terminal tool requires a hidden passphrase and a separate keyfile; losing either requires re-running setup and rotating the RW password in Neon. The local lockout file can be deleted by someone with disk access, which is why both factors and vault encryption are required.

Recommended order: create Neon roles, apply migrations to a TEST branch, run `node scripts/botdb setup`, run `node scripts/botdb scan`, inspect with `sync --dry-run`, then run `sync`. Keep the keyfile in a different physical location from `.env.admin` and keep a backup. Do not commit either file.

The authenticated sync opens a dedicated Neon `Client` transaction and takes a transaction-scoped advisory lock. Do not provide a pooled or PgBouncer transaction-mode URL to the admin tool. `check`, `list`, `stats`, `export`, and `sync --dry-run` use `BOTDB_READONLY_URL` or `DATABASE_URL` without write authentication.

`AUDIT_WEBHOOK_URL` is intentionally read from the process environment before vault unlock so failed-authentication and lockout alerts can be sent. It is not protected by `.env.admin`; protect it as a separate operational secret. Webhook failure is non-fatal and produces a warning.
