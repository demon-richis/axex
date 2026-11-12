# Axex bot database tool

Use `node scripts/botdb/index.js <command>` (or the package script when available). Supported local commands are `setup`, `scan`, `set <id> <status> [note]`, `check <id>`, `list`, `stats`, `export`, `sync [--dry-run] [--prune] [--force]`, `rotate`, `lock`, and `panic`. `bots.csv` is the master file and must never be committed. `bots.example.csv` contains fake IDs only.

Write operations require a hidden passphrase and the keyfile from `BOTDB_KEYFILE` or `.botdb/keyfile`. The key is derived with scrypt and HMAC and used for AES-256-GCM. Sessions auto-lock after five minutes and two minutes idle; failures lock for 15 minutes, one hour, then 24 hours. The RW credential is never an environment variable. If a passphrase or keyfile is lost, re-run setup and rotate the RW password in Neon.
