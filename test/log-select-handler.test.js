const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { MessageFlags, PermissionFlagsBits } = require("discord.js");

const sectionCalls = [];
const dbPath = require.resolve("../src/utils/liveUpdate");
const previousLiveUpdate = require.cache[dbPath];
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    async getCaseSection(guildId, caseCode, section) {
      sectionCalls.push({ guildId, caseCode, section });
      if (caseCode === "11111111" || guildId !== "guild-1") return null;
      return { embed: { toJSON: () => ({ title: "Case section" }) } };
    },
  },
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};
delete require.cache[require.resolve("../src/interactions/logSelectHandler")];
const { execute } = require("../src/interactions/logSelectHandler");

function makeInteraction(overrides = {}) {
  const replies = [];
  const edits = [];
  const interaction = {
    customId: "vlog:12345678",
    values: ["details"],
    guild: { id: "guild-1" },
    guildId: "guild-1",
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    isStringSelectMenu: () => true,
    async reply(payload) { replies.push(payload); },
    async deferReply(payload) { replies.push({ deferred: true, ...payload }); },
    async editReply(payload) { edits.push(payload); },
    ...overrides,
  };
  return { interaction, replies, edits };
}

test("select handler ignores malformed custom IDs", async () => {
  sectionCalls.length = 0;
  const { interaction, replies, edits } = makeInteraction({ customId: "vlog:1234567" });

  await execute(interaction);

  assert.equal(replies.length, 0);
  assert.equal(edits.length, 0);
  assert.equal(sectionCalls.length, 0);
});

test("select handler rejects interactions outside a guild", async () => {
  const { interaction, replies } = makeInteraction({ guild: null, guildId: null });

  await execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /only available inside its server/i);
  assert.equal(sectionCalls.length, 0);
});

test("select handler rejects members without Manage Server", async () => {
  const { interaction, replies } = makeInteraction({
    memberPermissions: { has: () => false },
  });

  await execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /Manage Server/i);
  assert.equal(sectionCalls.length, 0);
});

test("select handler cannot read a case from another server", async () => {
  sectionCalls.length = 0;
  const { interaction, replies, edits } = makeInteraction({ guildId: "guild-2" });

  await execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(edits.length, 1);
  assert.match(edits[0].content, /case ID was not found/i);
  assert.deepEqual(sectionCalls.at(-1), {
    guildId: "guild-2",
    caseCode: "12345678",
    section: "details",
  });
});

test("select handler rejects unsupported section values", async () => {
  sectionCalls.length = 0;
  const { interaction, replies } = makeInteraction({ values: ["raw-ip"] });

  await execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /section is not available/i);
  assert.equal(sectionCalls.length, 0);
});

test("select handler rejects unknown cases with an ephemeral response", async () => {
  const { interaction, replies, edits } = makeInteraction({ customId: "vlog:11111111" });

  await execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(edits.length, 1);
  assert.match(edits[0].content, /case ID was not found/i);
  assert.deepEqual(sectionCalls.at(-1), {
    guildId: "guild-1",
    caseCode: "11111111",
    section: "details",
  });
});

test("select handler returns the chosen section ephemerally", async () => {
  const { interaction, replies, edits } = makeInteraction({ values: ["timeline"] });

  await execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(replies[0].deferred, true);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].embeds[0].toJSON().title, "Case section");
  assert.deepEqual(sectionCalls.at(-1), {
    guildId: "guild-1",
    caseCode: "12345678",
    section: "timeline",
  });
});

test.after(() => {
  if (previousLiveUpdate) require.cache[dbPath] = previousLiveUpdate;
  else delete require.cache[dbPath];
  delete require.cache[require.resolve("../src/interactions/logSelectHandler")];
});
