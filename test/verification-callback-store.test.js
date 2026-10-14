const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const {
  createVerificationCallbackStore,
  fingerprintPayload,
} = require("../src/db/verificationCallbackStore");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "axex-callback-store-"));
const dataDir = path.join(root, "postgres");
const schema = fs.readFileSync(path.join(__dirname, "../src/db/schema.sql"), "utf8");
let db;
let store;

function makeSqlTag(database) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1]}`;
    }
    const result = await database.query(text, values);
    return result.rows;
  };
}

function callback(referenceId, overrides = {}) {
  const payload = {
    guildId: "guild-100",
    referenceId,
    userId: "user-200",
    passed: true,
    attempts: 1,
    ...overrides,
  };
  return {
    referenceId,
    guildId: payload.guildId,
    userId: payload.userId,
    passed: payload.passed,
    payloadHash: fingerprintPayload(payload),
  };
}

before(async () => {
  db = new PGlite(dataDir);
  await db.exec(schema);
  store = createVerificationCallbackStore(() => makeSqlTag(db));
});

after(async () => {
  if (db) await db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("a sequential duplicate after completion is idempotent", async () => {
  const input = callback("AX-10000001");
  const first = await store.claim(input);
  assert.equal(first.state, "claimed");
  assert.equal(await store.complete(input.referenceId, first.claimId), true);

  const duplicate = await store.claim(input);
  assert.deepEqual(duplicate, { state: "completed", passed: true });
});

test("concurrent duplicate claims yield one owner and one in-progress result", async () => {
  const input = callback("AX-10000002");
  const results = await Promise.all([store.claim(input), store.claim(input)]);
  assert.equal(results.filter((result) => result.state === "claimed").length, 1);
  assert.equal(results.filter((result) => result.state === "in_progress").length, 1);
});

test("a reused reference with changed user, guild, or result is rejected", async () => {
  const input = callback("AX-10000003");
  const first = await store.claim(input);
  assert.equal(first.state, "claimed");
  assert.equal(await store.complete(input.referenceId, first.claimId), true);

  assert.equal(
    (await store.claim(callback(input.referenceId, { userId: "user-other" }))).state,
    "conflict",
  );
  assert.equal(
    (await store.claim(callback(input.referenceId, { guildId: "guild-other" }))).state,
    "conflict",
  );
  assert.equal(
    (await store.claim(callback(input.referenceId, { passed: false }))).state,
    "conflict",
  );
});

test("a failed processing attempt can be retried without consuming the reference", async () => {
  const input = callback("AX-10000004");
  const first = await store.claim(input);
  assert.equal(first.state, "claimed");
  assert.equal(await store.retryable(input.referenceId, first.claimId, "simulated role failure"), true);

  const retry = await store.claim(input);
  assert.equal(retry.state, "claimed");
  assert.notEqual(retry.claimId, first.claimId);
  assert.equal(await store.complete(input.referenceId, retry.claimId), true);
  assert.deepEqual(await store.claim(input), { state: "completed", passed: true });
});

test("the durable role-retry worker can complete a retryable receipt", async () => {
  const input = callback("AX-10000007");
  const first = await store.claim(input);
  assert.equal(first.state, "claimed");
  assert.equal(await store.retryable(input.referenceId, first.claimId, "role update queued"), true);
  assert.equal(await store.completeAfterRoleRetry(input.referenceId), true);
  assert.deepEqual(await store.claim(input), { state: "completed", passed: true });
});

test("a callback storage outage fails closed before a claim is created", async () => {
  const unavailable = createVerificationCallbackStore(() => {
    throw new Error("simulated database outage");
  });
  await assert.rejects(unavailable.claim(callback("AX-10000005")), /simulated database outage/);
});

test("an expired processing lease is recovered from persistent storage after restart", async () => {
  const input = callback("AX-10000006");
  const first = await store.claim(input);
  assert.equal(first.state, "claimed");

  await db.close();
  db = new PGlite(dataDir);
  await db.query(
    "UPDATE verification_callback_receipts SET lease_until = NOW() - INTERVAL '1 second' WHERE reference_id = $1",
    [input.referenceId],
  );
  store = createVerificationCallbackStore(() => makeSqlTag(db));

  const recovered = await store.claim(input);
  assert.equal(recovered.state, "claimed");
  assert.notEqual(recovered.claimId, first.claimId);
  assert.equal(await store.complete(input.referenceId, recovered.claimId), true);
});
