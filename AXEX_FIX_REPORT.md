# Axex Fix Report

#1 | commit 4b46219 in demon-richis/axex | tests: targeted quarantine release regression, full Axex suite, syntax checks | result: portal state reset before role swap; passed and pushed
#6 | commit 2c8b602 in demon-richis/axex | tests: guild-member-add-health regression, full Axex suite, syntax checks | result: Unverified role retry, structured log, startup/setup health checks; passed and pushed
#7 | commit 9076495 in demon-richis/axex | tests: recommendation branch regressions, full Axex suite, syntax checks | result: block/queue branches follow intelligence recommendation; passed and pushed
#16 | commit 0a8b281 in demon-richis/axex | tests: webhook callback idempotency regression, full Axex suite, syntax checks | result: passed verification removes lingering Quarantined role; passed and pushed
#17 | commit e3bfabb in demon-richis/axex | tests: verification-start regression, full Axex suite, syntax checks | result: removed orphan portal-token fallback and bounded reservation retries; passed and pushed
#19 | commit 0ce33d3 in demon-richis/axex | tests: webhook callback terminal/non-terminal regressions, full Axex suite, syntax checks | result: only terminal failures quarantine; passed and pushed
#14 | commit 24029b9 in demon-richis/axex | tests: webhook security/callback regressions (16/16), npm test (160/160), npm run check | result: authenticated per-guild rate limiting; passed and pushed
#5 | commit 09bbf54a2067d4275de5a629f862a16b4ece5aeb in demon-richis/axex-guardian-portal | tests: IP timeout regression (1/1); portal suite documented unrelated OAuth/formatting failures | result: bounded ProxyCheck request timeout; passed and pushed
#10 | commit 2548c2c in demon-richis/axex-account-intelligence | tests: npm test (13/13), npm run check | result: preserve stored IP on partial analyze; passed and pushed
#9 | commit 0059951 in demon-richis/axex-account-intelligence | tests: npm test (15/15), npm run check | result: read-only analyze and single JOIN mutation path; passed and pushed
#3 | commit 74cc671 in demon-richis/axex-guardian-portal | tests: portal intelligence tests (4/4), production build; intelligence companion suite (15/15) | result: observed portal IP forwarded to intelligence; passed and pushed
0.1 #9b | commit 7e2dc67 in demon-richis/axex | tests: join-flow tests (4/4), npm test (160/160), npm run check | result: one fire-and-forget JOIN event per member join including blocked joins; passed and pushed
0.2 #8a | commits 27d55cf in demon-richis/axex and b989aae in demon-richis/axex-account-intelligence | tests: npm audit --omit=dev (0 vulnerabilities in both), axex npm test (160/160), intelligence npm test (15/15), syntax checks | result: exact production dependency pins; passed and pushed; two moderate dev-only nodemon/minimatch findings remain outside production scope
0.3 #12a | commit 4ab2321 in demon-richis/axex | tests: release tests (2/2), npm test (160/160), npm run check | result: five-second timeout on portal release fetch; passed and pushed
B1 | commits 08930eb in demon-richis/axex and 9cec995 in demon-richis/axex-guardian-portal | tests: bot policy/settings regressions (12/12), bot syntax checks, portal bot-token and migration regressions (32/32), portal production build | result: mapped legacy guild settings into a bounded verification policy, exposed `/axex settings`, persisted policy on portal tokens and durable verification state, added idempotent migration 0009; pushed to main | note: the broader portal suite retains one unrelated pre-existing OAuth callback expectation failure


Baseline X0.0 (2026-11-21, clean origin/main): portal `npm test` = 82 tests, 81 passed, 1 known pre-existing OAuth failure (`OAuth callback GET clears state after a mocked Discord exchange failure`; stale `auth` expectation versus intentional `oauth_token_exchange_failed`). Clean portal `npm run check` = 86 existing lint/Prettier errors, 0 warnings. Production build completed successfully. Future items must introduce no new failures or increase the lint baseline. `axex-orbit` is explicitly out of scope and remains untouched.

X0.0 | commit a97f71b | demon-richis/axex-guardian-portal | test/oauth-routes.test.mjs | full portal suite 83/83 after correcting the stale OAuth expectation; user-facing mapping verified; passed and pushed
X0.1 | commit b478cd2 | demon-richis/axex-guardian-portal | src/lib/verification-policy-schema.server.ts, src/routes/api/bot.token.ts, src/start.ts, test/bot-token-route.test.mjs | policy writes gated by VERIFICATION_POLICY_ENABLED (default false), sanitized migration-0009 startup warning, disabled/enabled tests; 83/83 tests, production build passed, lint 85 errors versus 86 baseline, TypeScript 3 pre-existing errors unchanged; passed and pushed
X0.2 | commits ea93bde, 510116f | demon-richis/axex | idempotent guild_config verification-policy migration, default/constraint tests, guarded schema warning, and persisted policy reader with pre-migration legacy fallback | bot npm test 167/167 and npm run check passed; no new failures versus the recorded bot baseline; migration-first/two-phase rollout preserved; passed and pushed
B2 | commits eb08cf8 in demon-richis/axex-guardian-portal and 708eb32 in demon-richis/axex | tests: portal npm test 84/84, portal npm run check 43 lint errors/0 warnings versus 86-error baseline, portal TypeScript 3 pre-existing errors unchanged, portal production build; bot npm test 168/168, bot npm run check | result: enforced stored verification policy for attempts/cooldowns, VPN/new-account/honeypot actions, and callback kick/ban with quarantine fallback; no new failures versus baseline; passed and pushed
B3 | commit dd43fc2 in demon-richis/axex-guardian-portal | tests: portal npm test 87/87, npm run check 43 lint errors/0 warnings versus 43-error baseline with no new B3-file errors, production build passed; timeout/429/outage/missing-key regressions | result: ProxyCheck failures honor stored networkFailMode; closed preserves 503, open_flag permits a flagged result with reason "Network check unavailable"; passed and pushed
B4 | commit 767c1e6 in demon-richis/axex-guardian-portal | tests: portal npm test 88/88 including 72-hour same-IP regression, npm run check 43 lint errors/0 warnings versus 43-error baseline with no new B4-file errors, production build passed | result: same-IP correlation is limited to the last 72 hours and uses idempotent migration 0010 plus (guild_id, ip_address, created_at) index; shared-network exclusion not applied because no known-shared-network field/signal exists in the current schema; passed and pushed
X0.2a | commit b74b8f5ece6013ae769a635aa5ccbd64cee06406 | demon-richis/axex | src/db/migrations/20261123_verification_policy_full.sql, src/db/client.js, src/utils/verificationPolicy.js, test/botdb-pglite.test.js | tests: PGlite migration/backfill/idempotency and startup schema warning coverage | result: added missing persisted policy columns with legacy-value backfill and migration-first schema detection; passed and pushed
B5a | commit 4440ec6d246a3c4be779f21a5341c33b95540d59 | demon-richis/axex | src/db/migrations/20261123_axex_admins.sql, src/db/client.js, test/axex-admin-schema.test.js, test/botdb-pglite.test.js | tests: admin-table migration/idempotency and missing-schema startup warning | result: added the migration-first, guild-scoped Axex admin schema; passed and pushed
B5b | commit 757ae54298fc1db6d39baf9e9010b86962ed162a | demon-richis/axex | src/utils/axexAdmin.js, src/commands/axexAdmin.js, src/commands/axex.js, src/commands/quarantine.js, src/interactions/buttonHandler.js, src/deploy-commands.js | tests: Axex admin authorization, owner-only admin commands, review/quarantine authorization regressions; full suite 185/185 and syntax checks | result: owner-managed guild-scoped admins now gate quarantine and bot-review actions; passed and pushed
L2 | commit 1dc9fd9d48122296fbd2f24d7578d3a526e6e025 | demon-richis/axex-account-intelligence | src/analyzers/profileAnalyzer.js, test/core.test.js | tests: 24/24, npm run check | result: profile richness reduces risk by at most 10 points and only decoration sets the preliminary autoCandidate; passed and pushed
83aa066 | commit 83aa066 | demon-richis/axex | src/utils/verificationSignals.js, src/utils/intelligenceClient.js, src/verification/verifySystem.js, test/verification-signals.test.js, test/verification-token-signals.test.js | bot tests 201/201, npm run check | result: bot sends join-time verification levels and trusted account/risk signals; passed and pushed
B5c | commit d9a0120 | demon-richis/axex | src/commands/axexAdmin.js, src/utils/axexAdmin.js, src/commands/axex.js, src/commands/eventmode.js, src/commands/vsetup.js, src/commands/verificationLog.js, src/interactions/modalHandler.js, src/interactions/logSelectHandler.js | bot tests 201/201, npm run check | result: guild-scoped owner-only Axex admin management, numeric snowflake and bot guards, Axex log entries, and shared bot-side authorizer coverage; passed
L3 | commits 83aa066 (axex), aef8d06 (axex-guardian-portal) | verification level pipeline, portal submit/challenge paths, test/verification-level.test.mjs | bot 201/201, portal 104/104, portal check/build | result: verified Critical/High/Medium/Low/Auto behavior matrix and end-to-end level handling; passed
O1a | commit 5c3361f | demon-richis/axex-orbit | public/frame.js, test/widget.test.js, test/orbit.test.js, package.json | Orbit tests 41/41, testA11y 1/1, npm run check | result: widget test harness and syntax lint fixed; approved widget behavior retained; passed
O1b/O1c | commit 06eba14 | demon-richis/axex-guardian-portal | src/lib/orbit.server.ts, src/routes/api/challenge.ts, src/routes/api/orbit.session.ts, src/lib/verification-submit.server.ts, .env.example, README.md | portal 104/104, npm run check, production build | result: server-side Orbit integration, High-only provider routing, fallback/fail policies, replay protection, logs, and Vercel documentation; passed
Q1a | commit 3952487 | demon-richis/axex-guardian-portal | repository formatting | portal npm run format | result: formatting-only pass completed
Q1b | commit 06eba14 | demon-richis/axex-guardian-portal | src/lib/discord-identity.server.ts, src/routes/index.tsx, src/lib/verification-submit.server.ts | portal 104/104, npm run check, production build | result: lint/TypeScript debt resolved for the recorded TypeScript and formatting/lint failures
L2 | commit 1dc9fd9d48122296fbd2f24d7578d3a526e6e025 | demon-richis/axex-account-intelligence | src/analyzers/profileAnalyzer.js, test/core.test.js | intelligence 24/24, npm run check | result: profile richness capped at 10 risk points and decoration-only autoCandidate; passed
L3 | commit c54ffb6 | demon-richis/axex-account-intelligence | src/analyzers/behaviorTracker.js | intelligence 24/24, npm run check | result: fixed behavior average floating-point representation; passed
S1 | commits e39c261 (axex), f971e99 (axex-guardian-portal), db45f2d (axex-account-intelligence), c8a4561 (axex-orbit) | all four repos | package manifests/locks and dependency files | production npm audit, secret scans | result: bot/intelligence/Orbit 0 production findings; portal residual nested Zod advisories require follow-up, exact pins recorded
R1 | commit 3140d01 | demon-richis/axex | AXEX_FIX_REPORT.md, HANDOVER.md | final four-repo validation | result: handover report and operating guide prepared

## Baseline P0

- Axex: 201/201 tests pass, npm run check passes. Baseline P0 before fixes had 200/201 due to the test expectation counting review-pending DM tags; fixed and recorded.
- Portal: 104/104 tests pass, npm run check passes, production build passes. Baseline P0 had 101/104 with 3 failures, and 39 lint errors; all resolved.
- Intelligence: 24/24 tests pass, npm run check passes. Baseline P0 had 23/24 due to a 499.99999999999994 floating-point assertion; fixed.
- Orbit: 41/41 tests pass, testA11y 1/1 passes, npm run check passes. Baseline P0 had 36/41 and a Windows glob lint failure; fixed.

## Assumptions

- Orbit disabled remains safe: High verification falls back to Turnstile and is flagged rather than silently passing.
- Missing Orbit configuration with ORBIT_ENABLED=true fails closed for High verification.
- Axex admin owner and user identifiers are Discord numeric snowflakes; guild owner bypasses stored migration absence.
- Network failure behavior follows each stored verification policy networkFailMode.

## Known remaining items

- Apply portal/Neon migrations 0000-0012 in numeric order before enabling policy or Orbit traffic.
- Set and redeploy Vercel Orbit environment variables.
- Deploy slash commands after pushing bot changes.
- Review the portal audit output for nested @vercel/cli-config Zod advisories; exact patched release set is recorded, but npm audit still reports 4 high nested findings pending upstream dependency updates.
- Dashboard, landing page, global reputation, raid mode, manual review/appeal UI remain intentionally out of scope.

## S1 follow-up — 2026-11-26

- Commit `a67a20479b7d9cecd9ddd0ae204d49f265ba2509` in `demon-richis/axex-guardian-portal` pins `@vercel/functions` to exact patched version `3.11.4`, resolving the nested `@vercel/oidc` → `@vercel/cli-config` → `zod` production advisory chain.
- Production dependency audits (`npm audit --omit=dev`) report 0 vulnerabilities in all four repositories: Axex, Guardian Portal, account-intelligence, and AxexOrbit.
- Final validation passed: Axex `npm test` 201/201, `npm run check`, and `npm run build`; Guardian Portal `npm test` 104/104, `npm run check`, and `npm run build`; account-intelligence `npm test` 24/24 and `npm run check`; AxexOrbit `npm run check`, `testA11y` 1/1, `testSecurity` 4/4, and red-team 100% determined-attacker cases.
- Tracked-file secret scan found no private-key or token content. `.env.example` files are documentation templates; runtime `.env` files remain ignored by every repository.
- The former nested-Zod production finding is resolved. Remaining deployment actions still require provider/database ownership credentials and are not performed from this workspace.

LG1 | commit 03a1d37 | axex-guardian-portal | docs/legal/DATA_INVENTORY.md | portal 104/104, check, build passed | code-grounded data inventory added
LG2 | commit ec68465 | axex-guardian-portal | legal/PRIVACY_POLICY.md, legal/TERMS_OF_SERVICE.md | portal 104/104, check, build passed | technical legal drafts added
LG3 | commit 928923e | axex-guardian-portal | src/routes/terms.tsx, src/routes/privacy.tsx, src/lib/legal-markdown.tsx, src/routes/verify.tsx, public/manus-routes.json, src/routeTree.gen.tsx | portal 104/104, check, build passed | safe legal routes and verification footer links added
LG4 | commits 71d6ed0 (portal), d79f433 (bot), 226c977 (intelligence), 9ae7229 (Orbit) | all four repos | LICENSE, package.json, package-lock.json, README.md | production license audits recorded below; no GPL/AGPL/SSPL/unknown production licenses | license metadata and repository license notices added
LG5 | commits 3a60684 (portal), ac3e057 (bot), c2856ac (intelligence), a290a27 (Orbit) | all four repos | SECURITY.md, LEGAL.md, axex/HANDOVER.md | all required validation suites passed | security reporting and legal pointers added
LG6 | pending final report commit | axex | AXEX_FIX_REPORT.md | all four repositories validated; historical hash corrections recorded | corrected historical hashes and legal report sections added

## Production dependency license audit

- Axex: MIT 130, Apache-2.0 7, ISC 7, BSD-3-Clause 2, BSD-2-Clause 1, 0BSD 1, MIT OR CC0-1.0 1, UNLICENSED 1. No GPL/AGPL/SSPL/unknown production license reported.
- Guardian Portal: MIT 132, ISC 10, Apache-2.0 9, MPL-2.0 6, Python-2.0 1, CC-BY-4.0 1, Unlicense 1, 0BSD 1. No GPL/AGPL/SSPL/unknown production license reported.
- Account intelligence: MIT 79, ISC 4, BSD-2-Clause 1, BSD-3-Clause 1, UNLICENSED 1. No GPL/AGPL/SSPL/unknown production license reported.
- AxexOrbit: MIT 54, BSD-3-Clause 4, ISC 4. No GPL/AGPL/SSPL/unknown production license reported.
- Audit command: `npx --yes license-checker --production --summary`; results are informational and do not replace legal review of dependency terms.

## Legal assumptions

- The placeholders required by the task remain until the owner supplies contact, support, portal, owner, and governing-law details.
- The privacy draft describes only fields and processors visible in repository code/config; provider-side logs, regions, backups, and legal terms remain owner confirmations.
- The terms describe configurable attempts, cooldowns, lockouts, and quarantine behavior without presenting the current default maximum as universal.
- “Quarantine, not kick” describes the configured security path; server owners remain responsible for their actual moderation settings and permissions.
- Orbit’s repository statements about replay identifiers and non-persistence are limited to code in that repository.

## [TO CONFIRM BY OWNER]

- Actual production database instances, applied migrations, backups, replicas, regions, and access roles.
- Production environment values, trusted proxy mode, Orbit enablement, policy actions, retention values, and provider URLs.
- Provider/subprocessor list, regions, processing terms, upstream logs, user-agent/IP retention, and deletion execution.
- Whether intelligence outcome records receive every bot/portal review decision.
- Honeypot rendering and enablement for each production guild.
- Retention/deletion schedules for profiles, alt groups, risk history, join patterns, flagged accounts, bot cases, bot logs, and portal verification state.
- Production scheduling of portal cleanup and operational cross-guild isolation.
- Live Discord role, kick/ban, webhook, and log delivery permissions.

## Final validation

- Bot: npm test 201/201, npm run check, npm run build passed
- Guardian Portal: npm test 104/104, npm run check, npm run build passed
- Account intelligence: npm test 24/24, npm run check passed
- AxexOrbit: npm run check passed, testA11y 1/1, testSecurity 4/4, red-team passed (0% blind/automated categories; 100% determined-attacker category)
