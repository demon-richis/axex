const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const rows = new Map();
const editPayloads = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isFinalStatus(status) {
  return ["verified", "failed", "quarantined"].includes(status);
}

const caseStore = {
  async getByCode(guildId, code) {
    const row = rows.get(code);
    return row && row.guild_id === guildId ? clone(row) : null;
  },
  async getByReference(guildId, referenceId) {
    for (const row of rows.values()) {
      if (row.guild_id === guildId && row.reference_id === referenceId) return clone(row);
    }
    return null;
  },
  async ensureForReference() {
    throw new Error("The seeded test cases should already exist");
  },
  async saveState(id, updates) {
    const row = [...rows.values()].find((item) => item.id === id);
    if (!row) return null;
    if (!isFinalStatus(row.status) && updates.status) row.status = updates.status;
    if (updates.summary !== null && updates.summary !== undefined) row.summary = clone(updates.summary);
    if (updates.logChannelId) row.log_channel_id = updates.logChannelId;
    if (updates.logMessageId) row.log_message_id = updates.logMessageId;
    return clone(row);
  },
  async claimExpired() {
    return [];
  },
};
const dbPath = require.resolve("../src/db/client");
const previousDb = require.cache[dbPath];
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    caseStore,
    getGuildConfig: async () => null,
    getVerificationTimeline: async () => [],
  },
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};
delete require.cache[require.resolve("../src/utils/liveUpdate")];

const { caseKey, pruneCaseStore, sendLiveUpdate } = require("../src/utils/liveUpdate");

function setupCase(code, status, summary = {}) {
  const messageId = "message-" + code;
  const channelId = "log-channel";
  const message = {
    async edit(payload) {
      editPayloads.set(code, payload);
      return message;
    },
  };
  const channel = {
    id: channelId,
    isTextBased: () => true,
    messages: {
      cache: new Map([[messageId, message]]),
      async fetch(id) {
        return id === messageId ? message : null;
      },
    },
    async send(payload) {
      editPayloads.set(code, payload);
      return { id: "new-" + messageId, edit: async () => {} };
    },
  };
  const row = {
    id: code,
    guild_id: "guild-live-update",
    user_id: "user-" + code,
    case_code: code,
    reference_id: "AX-" + code,
    token_expires_at: new Date(Date.now() + 600_000),
    status,
    log_channel_id: channelId,
    log_message_id: messageId,
    summary: clone(summary),
  };
  rows.set(code, row);
  return {
    row,
    guild: {
      id: "guild-live-update",
      channels: {
        cache: new Map([[channelId, channel]]),
        async fetch(id) { return id === channelId ? channel : null; },
      },
    },
  };
}

test("verification cases are isolated by reference ID when supplied", () => {
  const guild = { id: "guild-1" };
  assert.notEqual(
    caseKey(guild, { member: { id: "user-1" }, referenceId: "AX-CASE-A" }),
    caseKey(guild, { member: { id: "user-1" }, referenceId: "AX-CASE-B" }),
  );
  assert.equal(
    caseKey(guild, { member: { id: "user-1" }, referenceId: "AX-CASE-A" }),
    "guild-1:ref:AX-CASE-A",
  );
});

test("case cache removes expired entries", () => {
  const now = 1_000_000;
  const store = new Map([
    ["expired", { lastUpdatedAt: now - 30 * 60 * 1000 - 1 }],
    ["active", { lastUpdatedAt: now - 1_000 }],
  ]);
  pruneCaseStore(store, now);
  assert.deepEqual([...store.keys()], ["active"]);
});

test("case cache stays bounded and evicts the oldest active cases", () => {
  const now = 1_000_000;
  const store = new Map();
  for (let index = 0; index < 5_001; index += 1) {
    store.set(String(index), { lastUpdatedAt: now - index });
  }
  pruneCaseStore(store, now);
  assert.equal(store.size, 5_000);
  assert.equal(store.has("5000"), false);
});

test("a late final result overwrites an expired case and clears its expired flag", async () => {
  const { row, guild } = setupCase("12345678", "expired", { expired: true });

  await sendLiveUpdate(guild, {
    logType: "verified",
    action: "VERIFIED",
    caseCode: row.case_code,
    referenceId: row.reference_id,
    userId: row.user_id,
    userTag: "Member#1234",
    reason: "WEB_VERIFICATION_PASSED",
  });

  const saved = rows.get(row.case_code);
  const embed = editPayloads.get(row.case_code).embeds[0].toJSON();
  assert.equal(saved.status, "verified");
  assert.equal(saved.summary.expired, false);
  assert.equal(saved.summary.final.logType, "verified");
  assert.match(embed.description, /Verification Success/);
  assert.doesNotMatch(embed.description, /Verification Expired/);
});

test("an expiry update after a final result cannot downgrade the case", async () => {
  const final = {
    logType: "verified",
    action: "VERIFIED",
    reason: "WEB_VERIFICATION_PASSED",
    at: new Date().toISOString(),
  };
  const { row, guild } = setupCase("22345678", "verified", {
    expired: false,
    final,
  });

  await sendLiveUpdate(guild, {
    logType: "expired",
    caseCode: row.case_code,
    referenceId: row.reference_id,
    userId: row.user_id,
  });

  const saved = rows.get(row.case_code);
  const embed = editPayloads.get(row.case_code).embeds[0].toJSON();
  assert.equal(saved.status, "verified");
  assert.equal(saved.summary.expired, false);
  assert.deepEqual(saved.summary.final, final);
  assert.match(embed.description, /Verification Success/);
  assert.doesNotMatch(embed.description, /Verification Expired/);
});

test.after(() => {
  if (previousDb) require.cache[dbPath] = previousDb;
  else delete require.cache[dbPath];
  delete require.cache[require.resolve("../src/utils/liveUpdate")];
});


test("a live edit after 24 hours keeps the case dropdown disabled", async () => {
  const { row, guild } = setupCase("52345678", "in_progress", {});
  row.created_at = new Date(Date.now() - 25 * 60 * 60 * 1000);

  await sendLiveUpdate(guild, {
    logType: "intelligenceAnalysis",
    caseCode: row.case_code,
    referenceId: row.reference_id,
    userId: row.user_id,
    result: { riskScore: 10, riskLevel: "LOW" },
  });

  const select = editPayloads.get(row.case_code).components[0].toJSON().components[0];
  assert.equal(select.disabled, true);
  assert.equal(select.placeholder, "Expired · use /verification-log");
});
