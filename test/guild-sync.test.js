const assert = require("node:assert/strict");
const fs = require("node:fs");
const { after, before, test } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { createGuildSync } = require("../src/utils/guildSync");
const schema = fs.readFileSync(require.resolve("../src/db/schema.sql"), "utf8");
let db;
let sync;
function makeSqlTag(database) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await database.query(text, values)).rows;
  };
}
function guild(id, overrides = {}) {
  return { id, name: `Guild ${id}`, icon: null, ownerId: `owner-${id}`, memberCount: 10, ...overrides };
}
before(async () => {
  db = new PGlite();
  await db.exec(schema);
  sync = createGuildSync(() => makeSqlTag(db));
});
after(async () => {
  if (db) await db.close();
});
test("upsert records guild metadata and reactivates a previously removed guild", async () => {
  assert.equal(await sync.upsertGuild(guild("g-1")), true);
  await sync.markGuildRemoved("g-1");
  assert.equal(await sync.upsertGuild(guild("g-1", { name: "Renamed" })), true);
  const { rows } = await db.query("SELECT * FROM dashboard.bot_guilds WHERE guild_id = 'g-1'");
  assert.equal(rows[0].name, "Renamed");
  assert.equal(rows[0].removed_at, null);
  assert.equal(rows[0].member_count, 10);
});
test("markGuildRemoved timestamps the guild without deleting its record", async () => {
  await sync.upsertGuild(guild("g-2"));
  assert.equal(await sync.markGuildRemoved("g-2"), true);
  const { rows } = await db.query("SELECT removed_at FROM dashboard.bot_guilds WHERE guild_id = 'g-2'");
  assert.ok(rows[0].removed_at instanceof Date);
});
test("upsert persists an owner change", async () => {
  await sync.upsertGuild(guild("g-3"));
  await sync.upsertGuild(guild("g-3", { ownerId: "new-owner" }));
  const { rows } = await db.query("SELECT owner_id FROM dashboard.bot_guilds WHERE guild_id = 'g-3'");
  assert.equal(rows[0].owner_id, "new-owner");
});
test("full sync batches all joined guilds in one SQL statement", async () => {
  let statements = 0;
  const instrumented = createGuildSync(() => async (strings, ...values) => {
    statements += 1;
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await db.query(text, values)).rows;
  });
  const client = { guilds: { cache: new Map([["g-4", guild("g-4")], ["g-5", guild("g-5")]]) } };
  assert.equal(await instrumented.syncAllGuilds(client), true);
  assert.equal(statements, 1);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM dashboard.bot_guilds WHERE guild_id IN ('g-4', 'g-5')");
  assert.equal(rows[0].n, 2);
});
test("heartbeat updates last_seen_at for every current guild", async () => {
  await sync.upsertGuild(guild("g-6"));
  const ids = new Map([["g-6", guild("g-6")]]);
  const client = { guilds: { cache: { keys: () => ids.keys() } } };
  const originalSetInterval = global.setInterval;
  let callback;
  global.setInterval = (fn, ms) => {
    assert.equal(ms, 5 * 60 * 1000);
    callback = fn;
    return { unref() { this.unrefCalled = true; } };
  };
  try {
    const timer = sync.startGuildHeartbeat(client);
    assert.equal(timer.unrefCalled, true);
    await db.query("UPDATE dashboard.bot_guilds SET last_seen_at = NOW() - INTERVAL '1 hour' WHERE guild_id = 'g-6'");
    await callback();
    const { rows } = await db.query("SELECT last_seen_at > NOW() - INTERVAL '1 minute' AS fresh FROM dashboard.bot_guilds WHERE guild_id = 'g-6'");
    assert.equal(rows[0].fresh, true);
  } finally {
    global.setInterval = originalSetInterval;
  }
});
