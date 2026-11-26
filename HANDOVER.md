# Axex Ecosystem Handover

## Repositories

- `demon-richis/axex`: Discord.js v14 bot, Neon/PostgreSQL, slash commands, verification, quarantine, case logs, bot-side Zero Trust admins.
- `demon-richis/axex-guardian-portal`: TanStack/Vite portal, Cloudflare Turnstile, AxexOrbit integration, Discord OAuth, Drizzle/Neon migrations.
- `demon-richis/axex-account-intelligence`: Express account-risk and profile/behavior analysis service.
- `demon-richis/axex-orbit`: Fastify AxexOrbit temporal CAPTCHA service, signed challenges, PostgreSQL replay protection.

## Verification flow

1. Bot join flow computes verification level and trusted signals, reserves an eight-digit case ID, and creates a portal token.
2. Intelligence analyzes the account and provides risk/profile signals.
3. Portal binds the Discord OAuth identity to the bot-issued token.
4. Auto may pass eligible candidates; otherwise Low/Medium use Turnstile, High uses Orbit when enabled, and Critical quarantines directly.
5. Portal records durable attempt/cooldown/lock state and queues an authenticated callback.
6. Bot receives the callback, applies verify/quarantine/review behavior, updates the case, and writes the #axex-logs embed.

## Environment variables

Use names only; no values are recorded here.

Axex: DATABASE_URL, INTELLIGENCE_URL, INTELLIGENCE_API_KEY, BOT_TO_PORTAL_KEY, PORTAL_TO_BOT_KEY, BOT_WEBHOOK_URL, DISCORD_TOKEN, DISCORD_CLIENT_ID, PORTAL_URL, AXEX_BOT_API_KEY.

Portal: DATABASE_URL, SESSION_SECRET, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, TURNSTILE_SITE_KEY, TURNSTILE_INTERACTIVE_SITE_KEY, TURNSTILE_SECRET_KEY, ORBIT_ENABLED, ORBIT_PUBLIC_URL, ORBIT_API_URL, ORBIT_SIGNING_SECRET, PORTAL_HOSTNAME, PROXYCHECK_API_KEY, PROXYCHECK_TIMEOUT_MS, ALLOW_LOCALHOST_NETWORK_CHECK, TRUSTED_PROXY_MODE, RATE_LIMIT_BACKEND, CRON_SECRET, TOKEN_RETENTION_DAYS, AUDIT_LOG_RETENTION_DAYS, OUTBOX_RETENTION_DAYS, BOT_TO_PORTAL_KEY, PORTAL_TO_BOT_KEY, AXEX_BOT_API_KEY, BOT_WEBHOOK_URL, INTELLIGENCE_URL, INTELLIGENCE_API_KEY, VERIFICATION_POLICY_ENABLED.

Intelligence: DATABASE_URL, DISCORD_TOKEN, PORTAL_URL, API_KEY, PORT, NODE_ENV.

Orbit: NODE_ENV, PORT, TRUST_PROXY, ORBIT_SIGNING_KEY, ORBIT_SIGNING_KEY_ID, ORBIT_PREVIOUS_SIGNING_KEYS, ORBIT_SITE_SECRET, ORBIT_PREVIOUS_SITE_SECRETS, ORBIT_PUBLIC_URL, ALLOWED_ORIGINS, DATABASE_URL, PG_POOL_MAX, DB_CONNECT_TIMEOUT_MS, DB_QUERY_TIMEOUT_MS, MIN_BEHAVIOR, ORBIT_METRICS_ENABLED, LOG_LEVEL.

## Migration order

Portal: apply `drizzle/0000` through `drizzle/0012` in numeric order once, using the migration journal.

Bot: apply `src/db/migrations/20261112_bot_verification.sql`, `20261121_verification_policy.sql`, `20261123_verification_policy_full.sql`, `20261123_axex_admins.sql`, and `20261124_member_verification_timeout.sql` in numeric/chronological order.

Intelligence: run versioned migrations in `src/db/migrations`.

Orbit: use the PostgreSQL replay store migrations in `src/db/migrations` or provisioning scripts before production traffic.

## Test commands

- Bot: `npm ci`, `npm test`, `npm run check`, optional `npm run build`.
- Portal: `npm ci`, `npm test`, `npm run check`, `npm run build`.
- Intelligence: `npm ci`, `npm test`, `npm run check`.
- Orbit: `npm ci`, `npm run check`, `npm run testA11y`, `npm run testSecurity`, `npm run redteam`.

## Intentionally not built

Dashboard, landing page, global reputation, raid mode, and manual review/appeal UI remain out of scope.
