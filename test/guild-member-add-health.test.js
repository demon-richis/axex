const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

function mockModule(request, exports) {
  const resolved = require.resolve(request);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
    children: [],
    paths: Module._nodeModulePaths(path.dirname(resolved)),
  };
  return resolved;
}

const state = { updates: [], intelligence: null, quarantines: [] };
const mocked = [
  mockModule("../src/db/client", {
    async getGuildConfig() { return null; },
    async getGuildState() { return {}; },
    async setGuildState() { return {}; },
  }),
  mockModule("../src/utils/memberChecks", {
    async runPreChecks() {
      return {
        skip: false,
        config: {
          unverified_role_id: "unverified-role",
          verify_channel_id: "verify-channel",
          raid_threshold: 10,
        },
      };
    },
  }),
  mockModule("../src/utils/raidDetector", {
    RAID_CLEAR: 60_000,
    clearIfInactive() { return false; },
    getRecentJoinCount() { return 0; },
    recordJoin() { return false; },
  }),
  mockModule("../src/utils/intelligenceClient", {
    async analyzeUser() { return state.intelligence; },
  }),
  mockModule("../src/utils/liveUpdate", {
    async sendLiveUpdate(_guild, data) { state.updates.push(data); },
  }),
  mockModule("../src/events/botVerification", { async execute() {} }),
  mockModule("../src/verification/verifySystem", {
    async quarantineUser(_member, _config, reason) { state.quarantines.push(reason); },
    async recordAction() {},
  }),
];
const { execute } = require("../src/events/guildMemberAdd");

function makeMember({ failRoles = true } = {}) {
  let attempts = 0;
  return {
    id: "user-1",
    user: { id: "user-1", bot: false, tag: "user#0001" },
    guild: {
      id: "guild-1",
      channels: { cache: new Map() },
    },
    roles: {
      async add() {
        attempts += 1;
        if (failRoles) throw new Error(`role failure ${attempts}`);
      },
      get attempts() { return attempts; },
    },
  };
}

test("failed Unverified assignment is retried once and logged with unverifiedRoleFailed", async () => {
  state.updates.length = 0;
  const member = makeMember();

  await execute(member);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(member.roles.attempts, 2);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].logType, "unverifiedRoleFailed");
  assert.equal(state.updates[0].error, "role failure 2");
  assert.equal(state.updates[0].roleName, "Unverified");
});

test("recommendation block quarantines a join", async () => {
  state.intelligence = { recommendation: "block", riskLevel: "high" };
  state.quarantines.length = 0;

  await execute(makeMember({ failRoles: false }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(state.quarantines, ["INTELLIGENCE_BLOCK"]);
  state.intelligence = null;
});

test("recommendation queue reaches the review quarantine branch", async () => {
  state.intelligence = { recommendation: "queue", riskLevel: "critical" };
  state.quarantines.length = 0;

  await execute(makeMember({ failRoles: false }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(state.quarantines, ["INTELLIGENCE_RECOMMENDATION_REVIEW"]);
  state.intelligence = null;
});

test.after(() => {
  for (const resolved of mocked) delete require.cache[resolved];
  delete require.cache[require.resolve("../src/events/guildMemberAdd")];
});

const { checkRoleHealth } = require("../src/utils/roleHealth");

test("role health requires Manage Roles and places every Axex role below the bot", async () => {
  const roles = new Map([
    ["verified", { id: "verified", position: 4 }],
    ["unverified", { id: "unverified", position: 3 }],
    ["quarantined", { id: "quarantined", position: 2 }],
  ]);
  const guild = { roles: { cache: roles } };
  const bot = {
    permissions: { has() { return true; } },
    roles: { highest: { position: 5 } },
  };
  const healthy = await checkRoleHealth(guild, {
    verified_role_id: "verified",
    unverified_role_id: "unverified",
    quarantined_role_id: "quarantined",
  }, bot);
  assert.deepEqual(healthy, { ok: true, issues: [] });

  const unhealthy = await checkRoleHealth(guild, {
    verified_role_id: "verified",
    unverified_role_id: "unverified",
    quarantined_role_id: "quarantined",
  }, {
    permissions: { has() { return false; } },
    roles: { highest: { position: 3 } },
  });
  assert.equal(unhealthy.ok, false);
  assert.deepEqual(unhealthy.issues, [
    "missing Manage Roles",
    "bot role is not above Verified",
    "bot role is not above Unverified",
  ]);
});
