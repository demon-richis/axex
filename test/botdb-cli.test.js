const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { main } = require("../scripts/botdb"); const { createPostgresAdapter } = require("../scripts/botdb/lib/postgresAdapter");
async function setupDb() { const db = new PGlite(); await db.exec(fs.readFileSync("src/db/schema.sql", "utf8")); await db.exec(fs.readFileSync("src/db/migrations/20261112_bot_verification.sql", "utf8")); return db; }
function ctx(root, extra = {}) { return { root, isTTY: true, stdout: { isTTY: false, write() {} }, ...extra }; }

test("real CLI setup, scan, set, and read-only commands are reachable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axex-cli-")); const keyfile = path.join(root, ".botdb", "keyfile");
  await main(["setup", "--fast"], ctx(root, { keyfile, promptHidden: async () => "Strong test passphrase 123!" }));
  const rows = [{ id: "12345678901234567", status: "unverified", name: "", note: "" }]; fs.writeFileSync(path.join(root, "bots.csv"), "id,status,name,note\n12345678901234567,unverified,,\n"); process.env.BOT_TOKEN = "fake-test-token";
  await main(["scan", "--fast"], ctx(root, { fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: rows[0].id, username: "TestBot", bot: true, public_flags: 65536 }) }) }));
  const scanned = fs.readFileSync(path.join(root, "bots.csv"), "utf8"); assert.match(scanned, /TestBot/);
  await main(["set", rows[0].id, "verified", "manual", "--fast"], ctx(root));
  const db = await setupDb(); await db.query("INSERT INTO global_bots (bot_id,name,status,source) VALUES ($1,$2,$3,$4)", [rows[0].id, "TestBot", "verified", "axex_curated"]); const adapter = createPostgresAdapter(db);
  assert.equal((await main(["check", rows[0].id], ctx(root, { readAdapter: adapter }))).status, "verified"); assert.equal((await main(["stats"], ctx(root, { readAdapter: adapter }))).verified, 1); assert.equal((await main(["list", "--verified"], ctx(root, { readAdapter: adapter }))).length, 1); await main(["export"], ctx(root, { readAdapter: adapter })); await db.close();
});

test("real CLI sync authenticates, shows diff, re-enters passphrase for verified, and writes PGlite", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axex-sync-")); const keyfile = path.join(root, ".botdb", "keyfile"); const pass = "Strong test passphrase 123!";
  await main(["setup", "--fast"], ctx(root, { keyfile, promptHidden: async () => pass })); const id = "12345678901234567"; fs.writeFileSync(path.join(root, "bots.csv"), `id,status,name,note\n${id},verified,TestBot,\n`); fs.mkdirSync(path.join(root, ".botdb"), { recursive: true }); fs.writeFileSync(path.join(root, ".botdb", "scan-cache.json"), JSON.stringify({ scannedAt: new Date().toISOString(), rows: [{ id, status: "verified" }] })); const db = await setupDb(); const adapter = createPostgresAdapter(db); let prompts = 0; const result = await main(["sync", "--fast"], ctx(root, { keyfile, adapter, promptHidden: async () => { prompts += 1; return pass; } })); assert.equal(result.written, 1); assert.equal(prompts, 2); assert.equal((await db.query("SELECT count(*)::int AS count FROM global_bots")).rows[0].count, 1); assert.equal((await db.query("SELECT count(*)::int AS count FROM bot_db_audit")).rows[0].count, 1); await db.close();
});

test("real CLI rotate, lock, and panic paths are reachable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axex-rotate-")); const keyfile = path.join(root, ".botdb", "keyfile"); const pass = "Strong test passphrase 123!";
  await main(["setup", "--fast"], ctx(root, { keyfile, promptHidden: async () => pass })); const before = fs.readFileSync(path.join(root, ".env.admin"), "utf8");
  let prompts = [pass, "postgresql://test:new@localhost/db", pass]; await main(["rotate", "--fast"], ctx(root, { keyfile, promptHidden: async () => prompts.shift() })); const after = fs.readFileSync(path.join(root, ".env.admin"), "utf8"); assert.notEqual(after, before); await main(["lock", "--fast"], ctx(root));
  const oldWebhook = process.env.AUDIT_WEBHOOK_URL; process.env.AUDIT_WEBHOOK_URL = "https://audit.test/webhook"; let calls = 0; await main(["panic", "--fast"], ctx(root, { fetchImpl: async () => { calls += 1; return { ok: true }; } })); assert.equal(calls, 1); if (oldWebhook === undefined) delete process.env.AUDIT_WEBHOOK_URL; else process.env.AUDIT_WEBHOOK_URL = oldWebhook;
});
