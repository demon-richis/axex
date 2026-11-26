const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const state = {
  schemaReady: true,
  admins: [],
  addResult: true,
  removeResult: true,
  calls: [],
};
const dbPath = require.resolve("../src/db/client");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    isAxexAdminsSchemaReady: () => state.schemaReady,
    async getGuildConfig() { return null; },
    async addAxexAdmin(...args) {
      state.calls.push(["add", ...args]);
      return state.addResult;
    },
    async removeAxexAdmin(...args) {
      state.calls.push(["remove", ...args]);
      return state.removeResult;
    },
    async listAxexAdmins(...args) {
      state.calls.push(["list", ...args]);
      return state.admins;
    },
  },
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};

const { execute } = require("../src/commands/axexAdmin");

function makeInteraction({ action, userId = "123456789012345678", targetId = "123456789012345679" }) {
  const replies = [];
  return {
    interaction: {
      guild: { id: "guild-1", ownerId: "123456789012345678" },
      user: { id: userId },
      options: {
        getSubcommand: () => action,
        getUser: () => ({ id: targetId }),
      },
      async reply(payload) {
        replies.push(payload);
      },
    },
    replies,
  };
}

function resetState() {
  state.schemaReady = true;
  state.admins = [];
  state.addResult = true;
  state.removeResult = true;
  state.calls.length = 0;
}

test("only the guild owner can manage Axex administrators", async () => {
  resetState();
  const { interaction, replies } = makeInteraction({
    action: "add",
    userId: "guild-moderator",
  });

  await execute(interaction);

  assert.match(replies[0].content, /Only the server owner/);
  assert.deepEqual(state.calls, []);
});

test("owner can add, remove, and list guild-scoped administrators", async () => {
  resetState();
  let context = makeInteraction({ action: "add", targetId: "123456789012345679" });
  await execute(context.interaction);
  assert.deepEqual(state.calls[0], ["add", "guild-1", "123456789012345679", "123456789012345678"]);
  assert.match(context.replies[0].content, /now an Axex administrator/);

  state.addResult = false;
  context = makeInteraction({ action: "add", targetId: "123456789012345679" });
  await execute(context.interaction);
  assert.match(context.replies[0].content, /already an Axex administrator/);

  context = makeInteraction({ action: "remove", targetId: "123456789012345679" });
  await execute(context.interaction);
  assert.deepEqual(state.calls.at(-1), ["remove", "guild-1", "123456789012345679"]);
  assert.match(context.replies[0].content, /no longer an Axex administrator/);

  state.admins = [{ user_id: "123456789012345679" }];
  context = makeInteraction({ action: "list" });
  await execute(context.interaction);
  assert.deepEqual(state.calls.at(-1), ["list", "guild-1"]);
  assert.match(context.replies[0].content, /<@123456789012345679>/);
});

test("owner receives explicit migration instructions while admin storage is unavailable", async () => {
  resetState();
  state.schemaReady = false;
  const { interaction, replies } = makeInteraction({ action: "list" });

  await execute(interaction);

  assert.match(replies[0].content, /20261123_axex_admins\.sql/);
  assert.deepEqual(state.calls, []);
});
