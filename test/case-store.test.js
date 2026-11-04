const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { createCaseStore } = require("../src/db/caseStore");
const { CASE_CODE_PATTERN, generateCaseCode } = require("../src/utils/caseCode");
const { serverTagLabel, serverTagRow, withServerTag } = require("../src/utils/serverTag");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "axex-case-store-"));
const schema = fs.readFileSync(path.join(__dirname, "../src/db/schema.sql"), "utf8");
let db;

function makeSqlTag(database) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    const result = await database.query(text, values);
    return result.rows;
  };
}

function sequence(...codes) {
  let index = 0;
  return () => codes[Math.min(index++, codes.length - 1)];
}

before(async () => {
  db = new PGlite(path.join(root, "postgres"));
  await db.exec(schema);
});

after(async () => {
  if (db) await db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("generated case codes are always 8 digits and never start with zero", () => {
  for (let i = 0; i < 2000; i += 1) assert.match(generateCaseCode(), CASE_CODE_PATTERN);
  assert.equal(generateCaseCode(() => 10_000_000), "10000000");
  assert.equal(generateCaseCode(() => 99_999_999), "99999999");
});

test("reserve retries on a per-server collision and the same code is allowed in another server", async () => {
  const store = createCaseStore(() => makeSqlTag(db), {
    generate: sequence("11111111", "11111111", "22222222", "11111111"),
  });
  const first = await store.reserve({ guildId: "g-1", userId: "u-1" });
  assert.equal(first.case_code, "11111111");
  const second = await store.reserve({ guildId: "g-1", userId: "u-2" });
  assert.equal(second.case_code, "22222222");
  const otherGuild = await store.reserve({ guildId: "g-2", userId: "u-3" });
  assert.equal(otherGuild.case_code, "11111111");
});

test("attaching a token stores the portal reference and expiry, and lookups find the case", async () => {
  const store = createCaseStore(() => makeSqlTag(db), { generate: sequence("33333333") });
  const reserved = await store.reserve({ guildId: "g-3", userId: "u-1" });
  const expires = new Date(Date.now() + 600_000);
  const attached = await store.attachToken(reserved.id, {
    referenceId: "AX-REF-3",
    tokenExpiresAt: expires,
  });
  assert.equal(attached.reference_id, "AX-REF-3");
  assert.equal((await store.getByCode("g-3", "33333333")).id, reserved.id);
  assert.equal((await store.getByReference("g-3", "AX-REF-3")).id, reserved.id);
  assert.equal(await store.getByCode("g-3", "not-a-code"), null);
  assert.equal(await store.getByReference("g-other", "AX-REF-3"), null);
});

test("discard only removes cases that never reached the portal", async () => {
  const store = createCaseStore(() => makeSqlTag(db), { generate: sequence("44444441", "44444442") });
  const orphan = await store.reserve({ guildId: "g-4", userId: "u-1" });
  assert.equal(await store.discard(orphan.id), true);
  const linked = await store.reserve({ guildId: "g-4", userId: "u-2" });
  await store.attachToken(linked.id, { referenceId: "AX-REF-4", tokenExpiresAt: null });
  assert.equal(await store.discard(linked.id), false);
});

test("ensureForReference creates one case per reference and never duplicates", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const [a, b] = await Promise.all([
    store.ensureForReference({ guildId: "g-5", userId: "u-1", referenceId: "AX-REF-5" }),
    store.ensureForReference({ guildId: "g-5", userId: "u-1", referenceId: "AX-REF-5" }),
  ]);
  assert.equal(a.id, b.id);
  const rows = await db.query("SELECT count(*)::int AS n FROM verification_cases WHERE reference_id = 'AX-REF-5'");
  assert.equal(rows.rows[0].n, 1);
});

test("a final status replaces in_progress and expired but is never overwritten", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const row = await store.ensureForReference({ guildId: "g-6", userId: "u-1", referenceId: "AX-REF-6" });
  assert.equal((await store.saveState(row.id, { status: "expired" })).status, "expired");
  assert.equal((await store.saveState(row.id, { status: "verified" })).status, "verified");
  assert.equal((await store.saveState(row.id, { status: "failed" })).status, "verified");
  assert.equal((await store.saveState(row.id, { status: "expired" })).status, "verified");
  assert.equal((await store.saveState(row.id, { status: "bogus" })).status, "verified");
});

test("saveState keeps the log message and stores the summary as JSON", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const row = await store.ensureForReference({ guildId: "g-7", userId: "u-1", referenceId: "AX-REF-7" });
  await store.saveState(row.id, {
    summary: { user: { id: "u-1" }, intelligence: { riskScore: 4 } },
    logChannelId: "chan-1",
    logMessageId: "msg-1",
  });
  const saved = await store.saveState(row.id, { status: "in_progress" });
  assert.equal(saved.log_channel_id, "chan-1");
  assert.equal(saved.log_message_id, "msg-1");
  assert.equal(saved.summary.intelligence.riskScore, 4);
});

test("claimExpired returns each abandoned case exactly once and respects the grace period", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const past = new Date(Date.now() - 10 * 60_000);
  const recent = new Date(Date.now() - 30_000);
  const future = new Date(Date.now() + 600_000);
  for (const [ref, expires] of [["AX-EXP-1", past], ["AX-EXP-2", recent], ["AX-EXP-3", future]]) {
    const row = await store.ensureForReference({ guildId: "g-8", userId: `u-${ref}`, referenceId: ref });
    await store.attachToken(row.id, { referenceId: ref, tokenExpiresAt: expires });
  }
  const [first, second] = await Promise.all([
    store.claimExpired({ graceSeconds: 120 }),
    store.claimExpired({ graceSeconds: 120 }),
  ]);
  const claimed = [...first, ...second].map((row) => row.reference_id);
  assert.deepEqual(claimed, ["AX-EXP-1"]);
  assert.equal((await store.getByReference("g-8", "AX-EXP-1")).status, "expired");
  assert.equal((await store.getByReference("g-8", "AX-EXP-2")).status, "in_progress");
  assert.equal((await store.getByReference("g-8", "AX-EXP-3")).status, "in_progress");
  assert.deepEqual(await store.claimExpired({ graceSeconds: 120 }), []);
});

test("completed cases are never claimed as expired", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const row = await store.ensureForReference({ guildId: "g-9", userId: "u-1", referenceId: "AX-EXP-9" });
  await store.attachToken(row.id, {
    referenceId: "AX-EXP-9",
    tokenExpiresAt: new Date(Date.now() - 3_600_000),
  });
  await store.saveState(row.id, { status: "verified" });
  const claimed = await store.claimExpired({ graceSeconds: 0 });
  assert.equal(claimed.some((item) => item.reference_id === "AX-EXP-9"), false);
});

test("server tag is a disabled button labelled '- servername', truncated to 80 characters", () => {
  assert.equal(serverTagLabel("Axex QA lab"), "- Axex QA lab");
  assert.equal(serverTagLabel("   "), "- Unknown server");
  assert.equal(Array.from(serverTagLabel("A".repeat(200))).length, 80);
  const row = serverTagRow({ name: "Axex QA lab" }).toJSON();
  assert.equal(row.components.length, 1);
  assert.equal(row.components[0].disabled, true);
  assert.equal(row.components[0].label, "- Axex QA lab");
  const payload = withServerTag({ name: "Axex QA lab" }, { embeds: [], components: [{ type: 1, components: [] }] });
  assert.equal(payload.components.length, 2);
});


test("getLatestForUser returns the newest case within the guild", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const first = await store.ensureForReference({ guildId: "g-menu-1", userId: "u-latest", referenceId: "AX-LATEST-1" });
  const second = await store.ensureForReference({ guildId: "g-menu-1", userId: "u-latest", referenceId: "AX-LATEST-2" });
  await db.query("UPDATE verification_cases SET created_at = NOW() - INTERVAL '2 minutes' WHERE id = $1", [first.id]);
  assert.equal((await store.getLatestForUser("g-menu-1", "u-latest")).id, second.id);
  assert.equal(await store.getLatestForUser("other-guild", "u-latest"), null);
});

test("listMenuExpiry honors the 24-hour age, skips disabled or unlogged cases, and markMenuDisabled persists", async () => {
  const store = createCaseStore(() => makeSqlTag(db));
  const eligible = await store.ensureForReference({ guildId: "g-menu-2", userId: "u-1", referenceId: "AX-MENU-1" });
  const tooRecent = await store.ensureForReference({ guildId: "g-menu-2", userId: "u-2", referenceId: "AX-MENU-2" });
  const noMessage = await store.ensureForReference({ guildId: "g-menu-2", userId: "u-3", referenceId: "AX-MENU-3" });
  const disabled = await store.ensureForReference({ guildId: "g-menu-2", userId: "u-4", referenceId: "AX-MENU-4" });
  await db.query("UPDATE verification_cases SET created_at = NOW() - INTERVAL '25 hours', log_channel_id='chan', log_message_id='msg' WHERE id = $1", [eligible.id]);
  await db.query("UPDATE verification_cases SET log_channel_id='chan', log_message_id='msg' WHERE id = $1", [tooRecent.id]);
  await db.query("UPDATE verification_cases SET created_at = NOW() - INTERVAL '25 hours' WHERE id = $1", [noMessage.id]);
  await db.query("UPDATE verification_cases SET created_at = NOW() - INTERVAL '25 hours', log_channel_id='chan', log_message_id='msg', summary=$1::jsonb WHERE id = $2", [JSON.stringify({ menuDisabled: true }), disabled.id]);

  const rows = await store.listMenuExpiry({ olderThanHours: 24, limit: 50 });
  assert.deepEqual(rows.map((row) => row.id), [eligible.id]);
  const marked = await store.markMenuDisabled(eligible.id);
  assert.equal(marked.summary.menuDisabled, true);
  assert.deepEqual(await store.listMenuExpiry({ olderThanHours: 24, limit: 50 }), []);
});
