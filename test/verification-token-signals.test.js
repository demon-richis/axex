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
  guildState: {},
  recentJoinCount: 0,
  intelligence: null,
  tokenRequests: [],
  caseId: 0,
};

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

const mocked = [
  mockModule("../src/db/client", {
    async createQuarantineCase() {},
    async getGuildState() { return state.guildState; },
    async logQuarantine() {},
    async logVerificationEvent() { return { eventId: "event-1" }; },
    caseStore: {
      async reserve() {
        state.caseId += 1;
        return { id: state.caseId, case_code: String(10000000 + state.caseId) };
      },
      async attachToken(id, { referenceId, caseCode }) {
        return { id, case_code: caseCode, reference_id: referenceId };
      },
      async discard() {},
    },
  }),
  mockModule("../src/utils/memberChecks", {
    async runPreChecks() { return { skip: false }; },
  }),
  mockModule("../src/utils/liveUpdate", {
    async sendLiveUpdate() {},
  }),
  mockModule("../src/utils/intelligenceClient", {
    async analyzeUser() { return state.intelligence; },
  }),
  mockModule("../src/utils/raidDetector", {
    getRecentJoinCount() { return state.recentJoinCount; },
  }),
  mockModule("../src/config/runtime", {
    getPortalApiKey() { return "unit-test-key-not-a-secret"; },
  }),
  mockModule("../src/config/messages", {
    system: {
      verificationLinkError() { return { description: "link error" }; },
      verificationLinkReady(url) { return { description: url }; },
    },
    replies: {},
    quarantine: {},
    memberChecks: {},
  }),
];

const { handleVerifyStart } = require("../src/verification/verifySystem");

function makeInteraction(member) {
  const edits = [];
  return {
    interaction: {
      member,
      guild: {
        id: "guild-1",
        name: "Axex Test",
        memberCount: 10,
      },
      guildId: "guild-1",
      user: { id: member.id },
      deferred: true,
      replied: false,
      async editReply(payload) {
        edits.push(payload);
      },
    },
    edits,
  };
}

async function runTokenCreation({ ageDays, avatar, decoration, config }) {
  state.tokenRequests.length = 0;
  state.guildState = {};
  state.recentJoinCount = 0;
  state.intelligence = null;
  const member = {
    id: "user-1",
    user: {
      id: "user-1",
      tag: "user#0001",
      username: "user",
      createdTimestamp: Date.now() - ageDays * 86_400_000,
      avatar,
      ...(decoration ? { avatarDecorationData: { asset: "decoration" } } : {}),
    },
    guild: { id: "guild-1" },
    roles: { cache: { has: () => false } },
  };
  const { interaction } = makeInteraction(member);
  const originalGlobalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/verify/pending")) {
      return new Response("{}", { status: 404 });
    }
    if (String(url).endsWith("/api/bot/token")) {
      state.tokenRequests.push(JSON.parse(options.body));
      return new Response(JSON.stringify({
        token: "token-1",
        referenceId: "AX-REFERENCE-1",
        caseCode: "12345678",
      }), { status: 200 });
    }
    assert.fail(`Unexpected request: ${url}`);
  };
  try {
    await handleVerifyStart(interaction, {
      unverified_role_id: "unverified",
      min_account_age: 7,
      ...config,
    });
  } finally {
    global.fetch = originalGlobalFetch;
  }
  assert.equal(state.tokenRequests.length, 1);
  return state.tokenRequests[0];
}

test("verification token includes join-time level and profile trust candidate", async () => {
  const body = await runTokenCreation({
    ageDays: 2,
    avatar: "custom-avatar",
    decoration: true,
    config: { auto_verify_enabled: true },
  });

  assert.equal(body.level, "auto");
  assert.equal(body.autoCandidate, true);
  assert.deepEqual(body.profileSignals, { avatarDecoration: true });
  assert.deepEqual(body.riskSignals, {});
});

test("verification token includes high-level default-avatar risk", async () => {
  const body = await runTokenCreation({
    ageDays: 0,
    avatar: null,
    decoration: false,
    config: {},
  });

  assert.equal(body.level, "high");
  assert.equal(body.autoCandidate, false);
  assert.deepEqual(body.riskSignals, { defaultAvatar: true });
});

test.after(() => {
  global.fetch = originalFetch;
  if (originalWebsiteUrl === undefined) delete process.env.WEBSITE_URL;
  else process.env.WEBSITE_URL = originalWebsiteUrl;
  if (originalBotToPortalKey === undefined) delete process.env.BOT_TO_PORTAL_KEY;
  else process.env.BOT_TO_PORTAL_KEY = originalBotToPortalKey;
  for (const resolved of mocked) delete require.cache[resolved];
  delete require.cache[require.resolve("../src/verification/verifySystem")];
});
