const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const state = { schemaReady: true, admins: new Set(), lookups: 0 };
const dbPath = require.resolve("../src/db/client");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    getGuildConfig: async () => null,
    isAxexAdminsSchemaReady: () => state.schemaReady,
    async hasAxexAdmin(guildId, userId) {
      return state.admins.has(`${guildId}:${userId}`);
    },
    botVerificationStore: {
      async getLogByCase() {
        state.lookups += 1;
        return null;
      },
    },
  },
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};

const { execute } = require("../src/interactions/buttonHandler");

function makeInteraction(userId, ownerId = "owner-1") {
  const replies = [];
  const edits = [];
  return {
    interaction: {
      customId: "axex_botverify:approve:12345678",
      guild: { id: "guild-1", ownerId },
      user: { id: userId },
      member: { permissions: { has: () => true } },
      isButton: () => true,
      isStringSelectMenu: () => false,
      async reply(payload) {
        replies.push(payload);
      },
      async deferReply() {},
      async editReply(payload) {
        edits.push(payload);
      },
    },
    replies,
    edits,
  };
}

test("ManageGuild permission alone cannot review bot-verification cases", async () => {
  state.schemaReady = true;
  state.admins.clear();
  state.lookups = 0;
  const { interaction, replies } = makeInteraction("guild-moderator");

  await execute(interaction);

  assert.match(replies[0].content, /Only the server owner or an Axex administrator/);
  assert.equal(state.lookups, 0);
});

test("registered Axex admins reach case review and guild owners bypass a missing migration", async () => {
  state.schemaReady = true;
  state.admins = new Set(["guild-1:axex-admin"]);
  state.lookups = 0;
  let context = makeInteraction("axex-admin");
  await execute(context.interaction);
  assert.equal(state.lookups, 1);
  assert.match(context.edits[0], /stale or already resolved/);

  state.schemaReady = false;
  context = makeInteraction("owner-1", "owner-1");
  await execute(context.interaction);
  assert.equal(state.lookups, 2);
});
