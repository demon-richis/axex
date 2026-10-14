# AxeX Verification — Reconciled Security Assessment

**Assessment snapshot date:** 2026-10-12; **Target:** `demon-richis/axex`
**Snapshot note:** Repository-state and no-push statements below record the state on the assessment date; they are historical, not a statement of the later branch-push state.
**Execution scope:** Local source review, PGlite/PostgreSQL-engine tests, and an HTTP listener with mocked Discord/database integrations. No production Discord server, production members/roles, production database/configuration, live webhook, or portal runtime was contacted. No token, secret, or webhook URL was read or exposed. Nothing was committed, pushed, or deployed.

## Executive summary

The earlier callback replay finding is **fixed in this uncommitted working tree**. The bot now uses a persistent receipt row keyed by the portal’s existing `referenceId`, bound to the guild, user, result, and canonical payload hash. Database uniqueness and conditional state updates serialize claims across application instances; completed replays return an idempotent acknowledgment, conflicting payloads are rejected, and in-progress callbacks are not processed twice. Leases and retryable status preserve recovery after process failure or role/database errors. Role changes reconcile against current member roles, and stable event IDs/retry reconciliation reduce duplicate audit or role work.

**End-to-end verification is not secure yet.** Inspection of the companion portal found a separate, source-confirmed high-severity flaw: the quiz answer is checked in browser code, then the browser submits `passed: true`; the portal callback uses that caller-controlled value when computing `finalPassed`. A user with their own valid link and OAuth identity can call the portal endpoint directly and skip the answer-selection UI. This assessment did not issue a runtime request to a portal database/staging deployment, so the attack is **confirmed by source path, not by live HTTP execution**. Callback idempotency does not repair this authenticity flaw.

The bot fix is **ready for code review, not ready to be treated as a complete security release**. A private staging test against the actual Neon/Postgres deployment and a portal fix are required before a safe push/deploy decision.

## Repository state and previous-report reconciliation

- **Bot checkout:** branch `main`; `HEAD` and `origin/main` are both `ef16a728cf974493822a91cc19a52986f296013b`. The checkout is shallow and has uncommitted changes only; no new commit was created.
- **Cited commit `6eb6c97`:** cannot be resolved in the current checkout (`git cat-file -t 6eb6c97` fails) and was not present in the available history. Its contents therefore cannot be audited here.
- **Why the earlier counts/claims differed:** the latest pre-change checkout contained three tests in `test/webhook-security.test.js` and no callback idempotency guard. The earlier “five tests passed” / “15-minute in-memory cache added” statement does not match that source tree. Because the cited commit is absent and history is shallow, it is not possible to determine whether the earlier report described another checkout or was inaccurate. The current, post-change suite has **18 tests, all passing**. This is a source-state/report discrepancy, not a flaky test result.
- **Companion portal inspected read-only:** `demon-richis/axex-guardian-portal`, `main` at `1114a814c47041252d79303f0e659ec2971e0c5d`; the portal working tree remained clean. No portal files were changed.

## Findings and remediation

### F-01 — Caller-controlled `X-Forwarded-For` could rotate webhook rate-limit buckets

**Severity:** Medium. **Status:** Confirmed and fixed locally.

**Hypothesis/test:** Send requests through one local socket while rotating `X-Forwarded-For`. **Expected:** They share the same peer bucket and the over-limit request is rate-limited. **Actual:** The local receiver returns HTTP 429; the rate-limit key now uses `req.socket.remoteAddress`, not the untrusted header. Existing F-01 tests remain present and pass. If deployed behind a reverse proxy, a trusted-proxy policy and header sanitization still need deployment-specific review.

**Evidence:** `src/utils/webhookReceiver.js`; `test/webhook-security.test.js` and the new HTTP suite. Local-only; no deployed listener was tested.

### F-02 — Portal accepts a browser-asserted CAPTCHA/quiz result

**Severity:** High. **Status:** Confirmed in portal source; not fixed in this bot-only change; not executed against a live/staging portal.

**Hypothesis:** A holder of a valid verification link and OAuth identity can submit a passing callback without selecting the right answer. **Expected:** The server verifies a server-issued challenge/answer or trusted CAPTCHA assertion before it accepts success. **Actual/source evidence:** In `src/routes/verify.tsx`, the comparison `opt === question.answer` occurs in the browser; `submitAttempt` sends `passed` to `/api/callback`. In `src/routes/api/callback.ts`, `Body` accepts that boolean and `finalPassed` is computed from `passed` plus IP, account-age, and bot flags—there is no server-side answer/challenge verification. Directly setting `passed: true` is therefore sufficient when the other server-side conditions pass. This is a **source-confirmed bypass path**, not a claim that a live portal request was made.

The portal does perform meaningful surrounding checks: it requires a matching token row, rejects an expired or used row (except that a completed row is returned idempotently), requires an OAuth identity stored after Discord code exchange, and checks a supplied `discordId` against that stored identity. It increments attempts server-side and checks cooldown/lockout. Those controls do not make the browser-supplied pass result trustworthy.

**Required portal fix:** make the challenge outcome server-verifiable and bind it to the issued token, Discord identity, guild, and expiry; do not accept a client Boolean as proof. Use a server-side challenge record or a CAPTCHA provider token verified server-to-server. Add a test that submits `passed: true` without a valid challenge and expects rejection. Do not attempt to solve this by weakening bot checks or merely signing the portal’s current client-derived Boolean.

### F-03 — Portal callback consumption is not atomic across instances and failed bot delivery has no demonstrated retry path

**Severity:** Medium, and relevant to recovery/integration consistency. **Status:** Source-confirmed design gap; no multi-instance portal runtime test.

The portal has a process-local `inFlightCallbacks` `Set`, then updates the token with `WHERE token = ? AND used = false`; it does not check whether that conditional update changed a row before sending the bot webhook. The in-memory set does not coordinate multiple portal instances. The bot-side persistent receipt now prevents duplicate bot side effects for an identical `referenceId`, but the portal can still race its own audit/status updates.

For a passed result, the portal sets `used=true` before the bot HTTP call. A failed/timeout bot call leaves `status="bot_update_pending"`; a subsequent `/api/callback` request rejects the used token, and no durable portal-to-bot retry worker was found in source. The bot retains a retryable receipt and the existing Discord role retry queue handles role failures, but automatic portal redelivery after a callback/database transport failure was not verified.

**Required portal follow-up:** use a database-atomic consume/claim (for example, conditional update with `RETURNING` and abort if no row was claimed), plus a durable retry/outbox keyed by the same reference for bot callback delivery and status reconciliation. Keep the same reference and payload across retries.

### F-04 — Bot callback replay previously repeated role and moderation/audit work

**Severity:** Medium for duplicate effects; impact depended on the shared-key trust boundary. **Status:** Confirmed in the pre-change source/probe; fixed in the current uncommitted bot tree.

**Root cause:** The bot validated the shared API key and the shape of `guildId`, `userId`, and `passed`, then processed each delivery independently. There was no persistent callback-consumption record. A process-local cache would not have covered restarts or multiple bot instances.

**Fix:**

1. `verification_callback_receipts` adds a database-enforced primary key on the current portal `referenceId`, and binds each row to `guildId`, `userId`, `passed`, and a SHA-256 fingerprint of the canonical complete callback payload.
2. The first request atomically inserts a `processing` receipt. Reuse with changed identity/result/payload returns 409; an active claim returns 409; a completed exact replay returns an idempotent HTTP 200 without repeating work.
3. Retryable rows and expired 120-second leases can be reclaimed. A fresh `claim_id` fences stale workers from completing or releasing a newer worker’s claim. The callback fails closed if receipt storage is unavailable.
4. Discord role transitions inspect the fetched member’s current role cache before mutating. Role failures remain retryable through the existing durable role-update queue; the worker reconciles the receipt on completion. Reference-based quarantine log uniqueness and stable event IDs reduce duplicate database audit work after recovery.
5. The receiver now requires the exact format already generated by the inspected portal: `AX-` followed by eight uppercase hexadecimal characters. The portal currently creates this as `AX-${randomBytes(4).toString("hex").toUpperCase()}` and includes it in every bot callback.

**Reference limitation:** the portal’s `reference_id` column is nullable and has no uniqueness constraint; its current generator provides only 32 random bits. The bot-side primary key makes reuse/collision fail closed—different bound payloads are rejected rather than authorized—but a reference collision can deny service to a legitimate verification. Before production rollout, the portal should guarantee reference uniqueness (with a migration that checks existing collisions) or both sides should coordinate a stronger existing-session identifier. No new session format was invented in this fix.

### F-05 — Bot trusts the authenticated portal as the authority for verification success

**Severity:** High if the shared key or portal server is compromised; not evidence of unauthenticated bot access. **Status:** Bot trust model confirmed; portal result authenticity undermined by F-02.

The bot uses constant-time comparison for `x-api-key` and rejects missing/wrong keys. It does not independently know whether a `referenceId` was issued by the portal or whether the CAPTCHA was passed; with a valid key, a syntactically valid first-time reference and selected `guildId`/`userId`/`passed` are sufficient to enter processing. A local HTTP test with a synthetic reference and local test key exercises that trust model. This is not an unauthenticated production exploit and no real roles were changed. The portal constructs `guildId`, `userId`, and `referenceId` from the token row and sends the callback with `x-api-key: AXEX_BOT_API_KEY`; the browser-facing route itself checks same-origin/rate limit and the bearer token rather than that API key.

The portal API-key validator uses direct string equality (`provided === expected`), whereas the bot uses constant-time comparison. Neither secret value was read. The outbound API key authenticates the portal server, but it cannot establish a correct CAPTCHA result while the portal signs/forwards a user-controlled Boolean.

## Companion portal callback contract observed

The current portal-to-bot JSON fields are exactly: `guildId`, `referenceId`, `userId`, `discordId`, `discordTag`, `discordAvatar`, `passed`, `vpnDetected`, `vpnType`, `botDetected`, `honeypotTriggered`, `accountAgeDays`, `clickMs`, `flagged`, `flagReason`, `attempts`, `cooldownUntil`, `failureReason`, and `locked`. The portal POST uses `BOT_WEBHOOK_URL` and the `x-api-key` header. The bot idempotency change uses the already-present `referenceId`; no additional portal payload field is required for this local fix.

The portal’s `/api/auth/callback` exchanges the OAuth code with Discord, calls `/api/users/@me`, and stores the returned identity on the token row while `used=false`. Its `/api/callback` checks same-origin, rate-limits, loads the token row, checks expiry/used state and OAuth identity, and compares an optional submitted `discordId` with the stored value. It computes the attempt/cooldown/lockout and IP/account-age/bot flags server-side, but trusts `passed` from the request. Expiry is checked with `expiresAt < Date.now()`; completed tokens are specially returned as completed by the token GET route. These behaviors are source review only, not live integration verification.

## Attack-class test/review matrix

| Attack | Exact test/review | Expected | Actual and status |
|---|---|---|---|
| Claim success without completing actual verification | Read portal client answer handling and server callback calculation; no live portal DB/staging request. | Reject `passed=true` without a server-verified challenge. | Browser-only answer comparison; server trusts submitted Boolean. **Confirmed by source; runtime not tested. High priority.** |
| Forge callback/user/guild/result/reference | Local HTTP missing/wrong API key, malformed payload, invalid reference; same reference mutated across user/guild/result; source review of portal row binding. | Reject unauthenticated/malformed/conflicting data; bind portal identity and issued session. | Missing/wrong key 401; malformed/invalid reference 400; changed binding 409. Portal derives callback IDs from token row, but bot has no independent session registry and trusts valid-key first-use payloads. **Local tests/source review; no live portal.** |
| Replay, expired, consumed, invalid token | Sequential bot replay; portal source review of `used`, `expiresAt`, and completed state. | Completed bot callbacks idempotent; invalid/conflicting references rejected; expired/used portal requests rejected. | Bot sequential replay is idempotent; portal source checks expiry/used, but concurrent cross-instance consumption is not atomic; no runtime portal test. **Bot fixed locally; portal race remains.** |
| CAPTCHA attempts, cooldown, lockout, expiry | Portal source review only. | Enforce challenge correctness, attempts, cooldown, lockout, expiry server-side. | Attempt/cooldown/lockout/expiry checks exist in portal code, but challenge correctness is browser-only and can be bypassed with `passed=true`. **Source-reviewed; no staging runtime.** |
| Duplicate/concurrent callbacks and role effects | HTTP requests to local receiver; mocked Discord; PGlite store. | One processor for identical ref; replay does not repeat role transition; conflicting ref rejected. | Sequential duplicate 200 idempotent; concurrent duplicate receives 409 while one request completes 200; no second role mutation. Changed user/guild/result receives 409. **Passed locally.** |
| Verified role before authoritative server verification | Bot call-order/source review plus mock success callback. | Do not grant before accepted authoritative result. | Bot changes roles only in its authenticated `passed=true` branch. But portal’s `passed` authority is defective as described in F-02. No live role integration. **Bot path reviewed; end-to-end authority unresolved.** |
| Unauthorized quarantine/moderation | Wrong/missing key tests; mock failed-result callback replay; prior source review of `/quarantine` permission gate. | Unauthenticated caller cannot trigger action; one failed callback causes one logical quarantine. | Wrong/missing key returns 401; mock failure callback quarantines once and completed replay does not repeat. Slash command checks `ManageGuild` in source. No real Discord actions. **Local/source only.** |
| DB failure, restart, inconsistent state | PGlite executes project schema; simulated completion-write failure; close/reopen database with expired lease. | Fail closed before side effects on claim-store outage; preserve retry and recover stale claim. | Claim outage returns 503 in handler; simulated completion failure becomes retryable; after persistent restart and expired lease, new claim recovers. **Passed on PGlite; not tested against live Neon.** |
| Rate-limit header spoofing | Two local HTTP tests rotate `X-Forwarded-For` over one socket. | Same socket shares the rate bucket. | Over-limit request returns 429. **Passed locally; F-01 preserved.** |

## Automated tests and validation

`npm test` ran **18 tests: 18 passed, 0 failed, 0 skipped**. Coverage includes sequential duplicate, concurrent duplicate, conflicting user/guild/result, callback completion DB failure and retry, role API failure and recovery, durable role-retry receipt completion, quarantine replay, persistent storage restart/lease recovery, storage outage, API-key and reference validation, malformed payload handling, and F-01 forwarded-IP spoofing.

`@electric-sql/pglite` is a development-only embedded build of PostgreSQL; tests execute the project’s PostgreSQL schema/constraints rather than SQLite. It is **single-user/single-connection**, so the HTTP concurrency test interleaves multiple requests but does not constitute a multi-connection stress test of Neon’s serverless transport. The persistent-restart test closes and reopens the PGlite database client, then expires a stored lease; it is not an OS-process restart. The primary-key and conditional-update SQL use PostgreSQL semantics; no live Neon/staging credentials were available, and no claim of a live integration test is made.

Exactly-once behavior across Discord and PostgreSQL cannot be guaranteed by one database transaction. The receipt/claim prevents simultaneous processing; role state and database audit records are reconciled/deduplicated on retry. A crash during quarantine notification delivery can still cause an at-least-once channel notice when the receipt is recovered, and an operation that remains alive past its two-minute lease is not stopped by the claim fence. These cases require private multi-instance staging and operational review.

- `npm run check` — **passed**.
- `npm test` — **passed, 18/18**.
- `git diff --check` — **passed**. An additional whitespace scan found no trailing whitespace.

## Changed files and migration

Tracked modifications relative to `origin/main`:

- `package.json`, `package-lock.json` — Node test script, test-only PGlite dependency, and syntax-check inclusion for the new DB module.
- `src/db/client.js` — callback receipt APIs, retry-receipt reconciliation, reference-deduplicated quarantine logging, and completion of stale pending role-retry jobs.
- `src/db/schema.sql` — additive `verification_callback_receipts` table; additive quarantine `reference_id` column and partial unique index.
- `src/utils/webhookReceiver.js` — F-01 socket-peer rate limit retained; strict existing portal reference validation; persistent callback claims/replay/conflict handling; lease recovery; role-state reconciliation and retry completion.
- `src/verification/verifySystem.js` — quarantine role-state reconciliation and propagation of stable action IDs/reference IDs.

Untracked files to review/add if the owner chooses: `src/db/verificationCallbackStore.js`, `test/verification-callback-store.test.js`, `test/webhook-callback-idempotency.test.js`, the preserved `test/webhook-security.test.js`, and this report.

The database change is **additive** and is installed by the bot’s existing `initDB()` schema initialization. No existing records are deleted or rewritten. Test PGlite also executes the complete schema. Production rollout would still require normal schema/application sequencing and review; it was not performed.

## Prioritized remaining work and safe-push gate

1. **Fix F-02 in the portal**: replace the client-asserted `passed` Boolean with a server-verifiable challenge/CAPTCHA result bound to the issued token and OAuth identity. Add a regression test proving a direct `passed=true` request without valid challenge proof is rejected.
2. **Make portal session use atomic and retryable**: conditional `used=false` update must return/confirm the claimed row; add a durable bot-callback outbox/retry using the same unchanged reference and payload, and reconcile the portal’s `bot_update_pending` state. Ensure the 32-bit random reference cannot collide (or coordinate a stronger reference contract) without breaking existing links.
3. **Run private staging integration tests** against the paired portal and bot with separate application instances and a staging Postgres/Neon database. Verify token expiry, OAuth user/guild/reference binding, forged `passed` rejection, callback retry after timeout/DB failure, and one-time use under concurrent portal and bot instances. The PGlite tests are not a substitute for this transport/deployment test.
4. Review the entire local diff, choose/confirm the portal changes, and only then decide whether to push. The cited `6eb6c97` is absent; this work is a new uncommitted local change, not a restoration of that commit.

**Review status:** the bot-side replay fix is ready for local code review. **Not ready to push as a complete security fix** until F-02 and portal atomic/retry gaps are resolved or explicitly accepted by the owner after staging evidence. No push/deploy was performed; stopping here for your approval/instructions.
