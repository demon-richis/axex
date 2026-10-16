# Zoho Catalyst production deployment

This bot is a persistent Discord Gateway service. Deploy it to **Zoho Catalyst AppSail**, not a Catalyst Function. AppSail supports independent Node.js web services and provides the `X_ZOHO_CATALYST_LISTEN_PORT` runtime port contract. A Function is request-bounded and is not an appropriate home for a Discord Gateway connection.

## 1. Create the AppSail configuration

Copy the checked-in template and keep the generated file out of Git:

```sh
cp app-config.json.example app-config.json
```

The configured startup command is:

```text
node index.js
```

The service binds to `X_ZOHO_CATALYST_LISTEN_PORT` automatically. Locally, it falls back to `WEBHOOK_PORT` and then `3001`.

## 2. Configure secrets in Catalyst

Set these as AppSail environment variables in the Catalyst console or CLI. Never put their values in `app-config.json`, GitHub Actions logs, or issue comments.

Required:

- `BOT_TOKEN` — Discord bot token.
- `DATABASE_URL` — production Postgres/Neon connection string.
- `AXEX_BOT_API_KEY` — the shared secret used by the verification portal.

Required by the verification flow:

- `WEBSITE_URL` — public verification portal URL.
- `WEBSITE_API_KEY` — portal API key, if the portal integration uses it.
- `CLIENT_ID` — Discord application ID, needed by command deployment.

Optional:

- `INTELLIGENCE_URL`, `INTELLIGENCE_API_KEY`, `INTELLIGENCE_HEALTH_PATH`.
- `INTELLIGENCE_KEEPALIVE_MINUTES` (5–30; default 10).
- `WEBHOOK_PORT` (local development only; Catalyst overrides it).

Use separate values for Catalyst development and production environments. Rotate `BOT_TOKEN` and both API keys if they are ever exposed.

## 3. Deploy

From the repository root, initialize or add an AppSail service in the Catalyst CLI using the Node.js managed runtime, with this repository as the build path. Then deploy the AppSail service. The exact CLI prompts vary by Catalyst CLI version; the important values are:

- Stack: Node.js 18 or the currently supported Node.js managed runtime.
- Build path: repository root.
- Startup command: `node index.js`.
- Port: the AppSail-managed port, consumed from `X_ZOHO_CATALYST_LISTEN_PORT`.

Install dependencies from the lockfile during the build/deploy flow with `npm ci --omit=dev`.

After deployment, check:

```sh
curl -fsS https://<appsail-endpoint>/health
curl -fsS https://<appsail-endpoint>/ready
```

`/health` should return `200` while the process is running. `/ready` returns `200` only after the Discord client has connected; it returns `503` during startup.

## 4. Discord and portal configuration

- Enable the privileged **Server Members Intent** and **Message Content Intent** for the Discord application.
- Invite the bot with only the permissions it needs for verification, moderation, and logging.
- Configure the portal webhook URL as `https://<appsail-endpoint>/webhook/verify-result` and send `X-API-Key: <AXEX_BOT_API_KEY>`.
- Configure any intelligence integration against `/webhook/intelligence-event` with the same shared API-key policy.
- Run `npm run deploy-commands` once with the production `BOT_TOKEN`, `CLIENT_ID`, and optional `GUILD_ID` values before enabling production traffic.

## 5. Database and scaling warning

Run the schema initialization against the production database with the deploy. The application uses durable callback receipts and retry rows, so the database is required for safe operation.

AppSail can spawn more than one instance. Do not run multiple independently configured Discord bot deployments with the same token unless the deployment strategy has been tested for Discord Gateway session behavior. Keep one active bot service instance where the Catalyst plan/configuration permits it, and monitor AppSail instance events, Discord session errors, webhook 5xx responses, and pending role retries.

## References

- [Catalyst AppSail introduction](https://docs.catalyst.zoho.com/en/serverless/help/appsail/introduction/)
- [Catalyst AppSail configurations](https://docs.catalyst.zoho.com/en/serverless/help/appsail/appsail-configurations/)
- [Catalyst AppSail basics and limits](https://docs.catalyst.zoho.com/en/serverless/help/appsail/appsail-basics/)
- [Catalyst Node.js Express guide](https://docs.catalyst.zoho.com/en/serverless/help/appsail/help-guides/nodejs.md/express/)
