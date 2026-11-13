const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresAdapter, syncWithAdapter } = require("../scripts/botdb/lib/postgresAdapter");
const { verifyChain } = require("../scripts/botdb/lib/audit");
const { classifyBot } = require("../src/verification/botVerification");

async function database() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("src/db/schema.sql", "utf8"));
  await db.exec(fs.readFileSync("src/db/migrations/20261112_bot_verification.sql", "utf8"));
  return db;
}
async function close(db) { await db.close(); }

test("bot verification migration executes and enforces constraints/defaults", async () => {
  const db = await database();
  await db.query("INSERT INTO guild_config (guild_id) VALUES ($1)", ["guild-test"]);
  const config = (await db.query("SELECT bot_verification_enabled, unverified_bot_action, blocked_bot_action FROM guild_config WHERE guild_id=$1", ["guild-test"])).rows[0];
  assert.deepEqual(config, { bot_verification_enabled: true, unverified_bot_action: "restrict", blocked_bot_action: "ban" });
  await assert.rejects(() => db.query("INSERT INTO global_bots (bot_id,name,status,source) VALUES ('bad','x','verified','axex_curated')"));
  await assert.rejects(() => db.query("INSERT INTO global_bots (bot_id,name,status,source) VALUES ('12345678901234567','x','bad','axex_curated')"));
  await assert.rejects(() => db.query("INSERT INTO global_bots (bot_id,name,status,source) VALUES ('12345678901234567','x','verified','bad')"));
  await assert.rejects(() => db.query("UPDATE guild_config SET unverified_bot_action='bad' WHERE guild_id='guild-test'"));
  await assert.rejects(() => db.query("UPDATE guild_config SET blocked_bot_action='bad' WHERE guild_id='guild-test'"));
  await db.query("INSERT INTO bot_db_audit (action,actor,entry_hash) VALUES ('insert','test','h')");
  await assert.rejects(() => db.query("UPDATE bot_db_audit SET actor='tamper' WHERE seq=1"));
  await assert.rejects(() => db.query("DELETE FROM bot_db_audit WHERE seq=1"));
  await assert.rejects(() => db.query("TRUNCATE bot_db_audit"));
  await close(db);
});

test("real sync adapter commits chained audit rows and rolls back on failure", async () => {
  const db = await database(); const adapter = createPostgresAdapter(db);
  const diff = { added: [{ id: "12345678901234567", name: "Test Bot", status: "verified", note: "x" }], changed: [], wouldRemove: [] };
  assert.deepEqual(await syncWithAdapter(adapter, diff, { actor: "test" }), { written: 1, dryRun: false });
  assert.equal((await db.query("SELECT count(*)::int AS count FROM global_bots")).rows[0].count, 1);
  const entries = (await db.query("SELECT * FROM bot_db_audit ORDER BY seq")).rows; assert.equal(verifyChain(entries).valid, true);
  await db.query("DROP TRIGGER bot_db_audit_no_update_delete ON bot_db_audit"); await db.query("UPDATE bot_db_audit SET actor='tampered' WHERE seq=1"); assert.equal(verifyChain((await db.query("SELECT * FROM bot_db_audit ORDER BY seq")).rows).valid, false);
  const bad = { added: [{ id: "12345678901234568", name: "Second", status: "verified", note: "x" }, { id: "not-an-id", name: "Bad", status: "verified" }], changed: [], wouldRemove: [] };
  await assert.rejects(() => syncWithAdapter(adapter, bad, { actor: "test" }));
  assert.equal((await db.query("SELECT count(*)::int AS count FROM global_bots")).rows[0].count, 1);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM bot_db_audit")).rows[0].count, 1);
  await close(db);
});

test("classifier reads real PGlite rows and preserves fail-closed ordering", async () => {
  const db = await database();
  await db.query("INSERT INTO global_bots (bot_id,name,status,source) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)", ["12345678901234567", "Allowed", "verified", "axex_curated", "12345678901234568", "Blocked", "blocked", "axex_curated"]);
  const lookup = async (_guild, id) => (await db.query("SELECT * FROM global_bots WHERE bot_id=$1", [id])).rows[0] || null;
  const base = { member: { id: "12345678901234567", guild: { id: "guild-test" }, user: { id: "12345678901234567", bot: true, username: "Allowed" } }, fetchUser: async () => ({ id: "12345678901234567", bot: true, username: "Allowed", publicFlags: { bitfield: 0 } }), findGlobalBot: lookup, isWhitelisted: async () => false, verifiedNames: [] };
  assert.equal((await classifyBot(base)).result, "allowed");
  assert.equal((await classifyBot({ ...base, member: { ...base.member, id: "12345678901234568", user: { ...base.member.user, id: "12345678901234568", username: "Blocked" } }, fetchUser: async () => ({ id: "12345678901234568", bot: true, username: "Blocked", publicFlags: { bitfield: 65536 } }) })).result, "blocked");
  await close(db);
});
