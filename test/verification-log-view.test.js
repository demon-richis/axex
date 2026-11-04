const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { PermissionFlagsBits } = require("discord.js");

let viewResult = null;
let timelineEvents = [{ action: "VERIFIED", username: "member", reason: "passed", created_at: new Date().toISOString() }];
const calls = { view: [], timeline: [], byCode: [] };
const dbPath = require.resolve("../src/db/client");
const livePath = require.resolve("../src/utils/liveUpdate");
const previousDb = require.cache[dbPath];
const previousLive = require.cache[livePath];
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    caseStore: { async getByCode(guildId, caseCode) { calls.byCode.push({ guildId, caseCode }); return { reference_id: "AX-REF-12345678" }; } },
    async getVerificationTimeline(guildId, referenceId, filters) { calls.timeline.push({ guildId, referenceId, filters }); return timelineEvents; },
  },
  children: [], paths: Module._nodeModulePaths(path.dirname(dbPath)),
};
require.cache[livePath] = {
  id: livePath, filename: livePath, loaded: true,
  exports: { async getCaseView(guildId, lookup) { calls.view.push({ guildId, lookup }); return viewResult; } },
  children: [], paths: Module._nodeModulePaths(path.dirname(livePath)),
};
delete require.cache[require.resolve("../src/commands/verificationLog")];
const { execute } = require("../src/commands/verificationLog");

function makeInteraction({ reference = null, user = null, format = "embed", action = null } = {}) {
  const replies = [];
  const interaction = {
    guildId: "guild-1",
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    options: {
      getString(name) { return name === "reference" ? reference : name === "action" ? action : name === "format" ? format : null; },
      getUser(name) { return name === "user" ? user : null; },
    },
    async reply(payload) { replies.push(payload); },
  };
  return { interaction, replies };
}

const components = [{ type: 1, components: [{ type: 3 }] }];
function beforeEachReset() {
  viewResult = { embed: { title: "compact" }, components };
  timelineEvents = [{ action: "VERIFIED", username: "member", reason: "passed", created_at: new Date().toISOString() }];
  for (const key of Object.keys(calls)) calls[key].length = 0;
}

test.beforeEach(beforeEachReset);

test("case code returns compact embed and components without event-dump embeds", async () => {
  const { interaction, replies } = makeInteraction({ reference: "12345678" });
  await execute(interaction);
  assert.deepEqual(calls.view, [{ guildId: "guild-1", lookup: { caseCode: "12345678" } }]);
  assert.equal(calls.timeline.length, 0);
  assert.deepEqual(replies[0].embeds, [viewResult.embed]);
  assert.deepEqual(replies[0].components, components);
});

test("missing compact case view falls back to the legacy event timeline", async () => {
  viewResult = null;
  const { interaction, replies } = makeInteraction({ reference: "AX-12345678" });
  await execute(interaction);
  assert.deepEqual(calls.view[0].lookup, { referenceId: "AX-12345678" });
  assert.equal(calls.timeline.length, 1);
  assert.ok(replies[0].embeds.length > 1);
});

test("JSON format bypasses compact case views and retains the JSON attachment", async () => {
  const { interaction, replies } = makeInteraction({ reference: "12345678", format: "json" });
  await execute(interaction);
  assert.equal(calls.view.length, 0);
  assert.equal(replies[0].files.length, 1);
  assert.match(replies[0].files[0].name, /\.json$/);
});

test("user lookup uses the latest-case view when available", async () => {
  const user = { id: "user-77" };
  const { interaction, replies } = makeInteraction({ user });
  await execute(interaction);
  assert.deepEqual(calls.view[0].lookup, { userId: "user-77" });
  assert.deepEqual(replies[0].components, components);
  assert.equal(calls.timeline.length, 0);
});

test.after(() => {
  if (previousDb) require.cache[dbPath] = previousDb;
  else delete require.cache[dbPath];
  if (previousLive) require.cache[livePath] = previousLive;
  else delete require.cache[livePath];
  delete require.cache[require.resolve("../src/commands/verificationLog")];
});
