const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const originalFetch = global.fetch;
const originalWebsiteUrl = process.env.WEBSITE_URL;
const originalWebsiteApiKey = process.env.WEBSITE_API_KEY;
process.env.WEBSITE_URL = "https://portal.invalid";
process.env.WEBSITE_API_KEY = "unit-test-key-not-a-secret";

const state = { config: null, configReads: 0 };
const dbPath = require.resolve("../src/db/client");
const dbExports = {
  async getGuildConfig() {
    state.configReads += 1;
    return state.config;
  },
  async createQuarantineCase() {},
  async getGuildState() {
    return {};
  },
  async logQuarantine() {},
  async logVerificationEvent(input) {
    return { eventId: input.eventId || "test-event" };
  },
};
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: dbExports,
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};

const { execute } = require("../src/interactions/buttonHandler");

function makeMember(guild, userId, { bot = false, roles = [] } = {}) {
  const roleIds = new Set(roles);
  return {
    id: userId,
    user: {
      id: userId,
      bot,
      tag: `test-${userId}`,
      createdTimestamp: Date.now() - 30 * 86_400_000,
    },
    guild,
    roles: {
      cache: { has: (id) => roleIds.has(id) },
      async add(id) {
        roleIds.add(id);
      },
      async remove(id) {
        roleIds.delete(id);
      },
    },
  };
}

function makeInteraction({
  userId = "member-1",
  ownerId = "owner-1",
  member,
  fetchMember,
} = {}) {
  const edits = [];
  const guild = {
    id: "guild-1",
    ownerId,
    name: "Isolated Test Guild",
    memberCount: 2,
    members: {
      async fetch(id) {
        if (fetchMember) return fetchMember(id);
        if (member?.id === id) return member;
        throw new Error("mock member unavailable");
      },
    },
  };
  const interaction = {
    customId: "axex_verify_start",
    guildId: guild.id,
    guild,
    user: { id: userId, bot: false },
    member,
    deferred: false,
    isStringSelectMenu: () => false,
    isButton: () => true,
    async deferReply() {
      interaction.deferred = true;
    },
    async editReply(payload) {
      edits.push(payload);
      return payload;
    },
  };
  return { interaction, edits, guild };
}

function setupConfig(overrides = {}) {
  state.config = {
    setup_done: true,
    verified_role_id: "verified-role",
    unverified_role_id: "unverified-role",
    quarantined_role_id: "quarantine-role",
    ...overrides,
  };
  state.configReads = 0;
}

function descriptionOf(payload) {
  return payload?.embeds?.[0]?.data?.description || "";
}

test("the real guild owner sees the existing owner embed and creates no portal request or verification session", async () => {
  setupConfig();
  let portalRequests = 0;
  global.fetch = async () => {
    portalRequests += 1;
    throw new Error("portal fetch must not happen for the owner");
  };
  const { interaction, edits } = makeInteraction({
    userId: "owner-1",
    ownerId: "owner-1",
    member: null,
  });

  await execute(interaction);

  assert.match(descriptionOf(edits.at(-1)), /Server Owner Detected/);
  assert.equal(portalRequests, 0);
  assert.equal(state.configReads, 0);
});

test("a normal unverified member reaches the existing pending and token creation flow", async () => {
  setupConfig();
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/verify/pending")) {
      return new Response(JSON.stringify({ token: null }), { status: 200 });
    }
    if (String(url).includes("/api/bot/token")) {
      return new Response(JSON.stringify({ referenceId: "AX-1234ABCD" }), {
        status: 201,
      });
    }
    throw new Error("unexpected mocked request URL");
  };
  const guild = {
    id: "guild-1",
    ownerId: "owner-1",
    name: "Isolated Test Guild",
    memberCount: 2,
  };
  const member = makeMember(guild, "member-1");
  const { interaction, edits } = makeInteraction({ member });
  interaction.guild = guild;

  await execute(interaction);

  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/api\/verify\/pending/);
  assert.match(requests[1].url, /\/api\/bot\/token$/);
  assert.match(descriptionOf(edits.at(-1)), /Verification Link Ready/);
});

test("already verified members keep the existing skip behavior and make no portal requests", async () => {
  setupConfig();
  const guild = { id: "guild-1", ownerId: "owner-1" };
  const member = makeMember(guild, "member-1", { roles: ["verified-role"] });
  let portalRequests = 0;
  global.fetch = async () => {
    portalRequests += 1;
    throw new Error("verified member must not reach portal");
  };
  const { interaction, edits } = makeInteraction({ member });
  interaction.guild = guild;

  await execute(interaction);

  assert.match(descriptionOf(edits.at(-1)), /Already Verified/);
  assert.equal(portalRequests, 0);
});

test("quarantined members keep the existing skip behavior and make no portal requests", async () => {
  setupConfig();
  const guild = { id: "guild-1", ownerId: "owner-1" };
  const member = makeMember(guild, "member-1", { roles: ["quarantine-role"] });
  let portalRequests = 0;
  global.fetch = async () => {
    portalRequests += 1;
    throw new Error("quarantined member must not reach portal");
  };
  const { interaction, edits } = makeInteraction({ member });
  interaction.guild = guild;

  await execute(interaction);

  assert.match(descriptionOf(edits.at(-1)), /Account Quarantined/);
  assert.equal(portalRequests, 0);
});

test("bot members keep the existing skip behavior and make no portal requests", async () => {
  setupConfig();
  const guild = { id: "guild-1", ownerId: "owner-1" };
  const member = makeMember(guild, "bot-member", { bot: true });
  let portalRequests = 0;
  global.fetch = async () => {
    portalRequests += 1;
    throw new Error("bot members must not reach portal");
  };
  const { interaction, edits } = makeInteraction({
    userId: "bot-member",
    member,
  });
  interaction.guild = guild;
  interaction.user.bot = true;

  await execute(interaction);

  assert.equal(portalRequests, 0);
  assert.match(
    String(edits.at(-1).content),
    /Preparing your verification link/,
  );
});

test("partial interaction member data is replaced by a fetched GuildMember before verification", async () => {
  setupConfig();
  let fullMember;
  let fetches = 0;
  const requests = [];
  global.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes("/api/verify/pending"))
      return new Response(JSON.stringify({ token: "existing-token" }), {
        status: 200,
      });
    throw new Error("an existing pending token should not need token creation");
  };
  const { interaction, edits, guild } = makeInteraction({
    member: { roles: ["raw-role-id"], user: { id: "member-1" } },
    fetchMember: async (id) => {
      fetches += 1;
      assert.equal(id, "member-1");
      return fullMember;
    },
  });
  guild.name = "Isolated Test Guild";
  guild.memberCount = 2;
  fullMember = makeMember(guild, "member-1");

  await execute(interaction);

  assert.equal(fetches, 1);
  assert.equal(requests.length, 1);
  assert.match(descriptionOf(edits.at(-1)), /Verification Link Ready/);
});

test("missing member data fails safely without creating a portal token", async () => {
  setupConfig();
  let portalRequests = 0;
  global.fetch = async () => {
    portalRequests += 1;
    throw new Error("no portal requests expected");
  };
  const { interaction, edits } = makeInteraction({ member: null });

  await execute(interaction);

  assert.equal(portalRequests, 0);
  assert.match(descriptionOf(edits.at(-1)), /Verification Link Failed/);
});

test.after(() => {
  global.fetch = originalFetch;
  if (originalWebsiteUrl === undefined) delete process.env.WEBSITE_URL;
  else process.env.WEBSITE_URL = originalWebsiteUrl;
  if (originalWebsiteApiKey === undefined) delete process.env.WEBSITE_API_KEY;
  else process.env.WEBSITE_API_KEY = originalWebsiteApiKey;
});
