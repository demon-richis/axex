# Axex bot database tool

Use `node scripts/botdb/index.js <command>` (or the package script when available). Supported local commands are `setup`, `scan`, `set <id> <status> [note]`, `check <id>`, `list`, `stats`, `export`, `sync [--dry-run] [--prune] [--force]`, `rotate`, `lock`, `panic`, and `ui-demo`. `bots.csv` is the master file and must never be committed. `bots.example.csv` contains fake IDs only.

Write operations require a hidden passphrase and the keyfile from `BOTDB_KEYFILE` or `.botdb/keyfile`. The key is derived with scrypt and HMAC and used for AES-256-GCM. Sessions auto-lock after five minutes and two minutes idle; failures lock for 15 minutes, one hour, then 24 hours. The RW credential is never an environment variable. If a passphrase or keyfile is lost, re-run setup and rotate the RW password in Neon.

## Connection and alert security

The authenticated CLI decrypts the RW connection string and opens a dedicated Neon `Client` transaction for each sync. Do not use a pooled or PgBouncer transaction-mode connection string for this admin tool; the transaction must preserve one backend session while taking `pg_advisory_xact_lock`.

Failed-authentication and lockout alerts must be sent before the vault can be opened. Therefore `AUDIT_WEBHOOK_URL` is read from the process environment and is intentionally not protected by the encrypted RW vault. Treat that URL as a separate operational secret, keep it out of logs, and rotate it independently.

## Terminal UI and secret input

The CLI uses a built-in Matrix-style green terminal theme. `--fast` and `--no-anim` skip the decrypt animation while retaining colors. `NO_COLOR` disables ANSI colors. `FORCE_COLOR=0`, `1`, `2`, or `3` controls the color level on interactive TTY output; non-TTY output is always plain text. Windows Terminal (`WT_SESSION`) and the VS Code terminal (`TERM_PROGRAM=vscode`) receive truecolor when available.

All passphrases and RW connection strings use raw-mode `readSecret`: accepted characters show only `*`, backspace removes one star, escape sequences are ignored, and Ctrl+C restores the terminal. Non-interactive environments refuse secret input rather than falling back to visible input. Setup shows a live passphrase length hint and asks for a confirmation; rejected values are never printed.

Run `node scripts/botdb/index.js ui-demo` in a terminal to preview the banner, boot lines, status badges, table, progress bar, result boxes, and a discarded secret-input demo. Do not use a real credential for the demo.
