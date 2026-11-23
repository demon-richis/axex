const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const originalFetch = global.fetch;
const originalWebsiteUrl = process.env.WEBSITE_URL;
const originalBotToPortalKey = process.env.BOT_TO_PORTAL_KEY;
process.env.WEBSITE_URL = "https://portal.invalid";
process.env.BOT_TO_PORTAL_KEY = "unit-test-key-not-a-secret";

const state = {
  item: { id: 7, reference_id: "AX-REF-12345678", account_age: 30 },
  config: {
    setup_done: true,
    quarantined_role_id: "quarantine-role",
    unverified_role_id: "unverified-role",
  },
  resolved: [],
  events: [],
  admins: new Set(["guild-1:moderator-1"]),
};
const dbPath = require.resolve("../src/db/client");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    isAxexAdminsSchemaReady() {
      return true;
    },
    async hasAxexAdmin(guildId, userId) {
      return state.admins.has(`${guildId}:${userId}`);
    },
    async getGuildConfig() {
      return state.config;
    },
    async getQuarantineCase() {
      return state.item;
    },
    async getQuarantineCases() {
      return [];
    },
    async resolveQuarantineCase(...args) {
      state.resolved.push(args);
      return true;
    },
    async logVerificationEvent(event) {
      state.events.push(event);
      return { eventId: "event-1" };
    },
  },
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};

const { execute } = require("../src/commands/quarantine");

function makeInteraction() {
  const edits = [];
  const roleChanges = [];
  const member = {
    id: "user-1",
    user: { tag: "user#0001" },
    roles: {
      async remove(roleId) {
        roleChanges.push(["remove", roleId]);
      },
      async add(roleId) {
        roleChanges.push(["add", roleId]);
      },
    },
  };
  const interaction = {
    guild: {
      id: "guild-1",
      ownerId: "owner-1",
      members: { async fetch() { return member; } },
    },
    user: { id: "moderator-1", tag: "mod#0001" },
    memberPermissions: { has() { return true; } },
    options: {
      getSubcommand() { return "release"; },
      getUser() { return { id: "user-1" }; },
    },
    async deferReply() {},
    async editReply(payload) {
      edits.push(payload);
      return payload;
    },
  };
  return { interaction, edits, roleChanges };
}

function resetState() {
  state.resolved.length = 0;
  state.events.length = 0;
  state.admins = new Set(["guild-1:moderator-1"]);
}

test("release calls the portal exactly once before swapping roles and resolves the case", async () => {
  resetState();
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  const { interaction, roleChanges, edits } = makeInteraction();

  await execute(interaction);

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/bot\/release$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    guildId: "guild-1",
    userId: "user-1",
  });
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.equal(requests[0].options.signal.aborted, false);
  assert.equal(requests[0].options.headers["x-api-key"], "unit-test-key-not-a-secret");
  assert.deepEqual(roleChanges, [
    ["remove", "quarantine-role"],
    ["add", "unverified-role"],
  ]);
  assert.deepEqual(state.resolved, [[7, "moderator-1", "released", "Released by administrator"]]);
  assert.equal(state.events[0].action, "QUARANTINE_RELEASED");
  assert.equal(state.events[0].referenceId, "AX-REF-12345678");
  assert.match(edits.at(-1).content, /Quarantine Released/);
});

test("release aborts on portal failure without changing roles or resolving the case", async () => {
  resetState();
  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({ error: "failed" }), { status: 503 });
  };
  const { interaction, roleChanges, edits } = makeInteraction();

  await execute(interaction);

  assert.equal(requests, 1);
  assert.deepEqual(roleChanges, []);
  assert.deepEqual(state.resolved, []);
  assert.deepEqual(state.events, []);
  assert.match(edits.at(-1).content, /Release Failed/);
});

test("ManageGuild permission alone cannot manage quarantine cases", async () => {
  resetState();
  state.admins.clear();
  const { interaction, edits } = makeInteraction();
  let replies = 0;
  interaction.reply = async () => { replies += 1; };

  await execute(interaction);

  assert.equal(replies, 1);
  assert.deepEqual(edits, []);
  assert.deepEqual(state.resolved, []);
});

test.after(() => {
  global.fetch = originalFetch;
  if (originalWebsiteUrl === undefined) delete process.env.WEBSITE_URL;
  else process.env.WEBSITE_URL = originalWebsiteUrl;
  if (originalBotToPortalKey === undefined) delete process.env.BOT_TO_PORTAL_KEY;
  else process.env.BOT_TO_PORTAL_KEY = originalBotToPortalKey;
});
