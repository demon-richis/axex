const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const storeCalls = { getByCode: [] };
const rows = [];
let finalStatus = "expired";
const caseStore = {
  async claimExpired(options) {
    storeCalls.claimExpired = options;
    return rows;
  },
  async getByCode(guildId, code) {
    storeCalls.getByCode.push({ guildId, code });
    return { guild_id: guildId, case_code: code, status: finalStatus };
  },
  async getByReference() { return null; },
  async ensureForReference() { return null; },
  async saveState() { return null; },
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
delete require.cache[require.resolve("../src/utils/caseSweeper")];

const { createCaseSweeper, EXPIRED_ACTION } = require("../src/utils/caseSweeper");

function makeRow(code, overrides = {}) {
  return {
    guild_id: "guild-1",
    user_id: "user-" + code,
    case_code: code,
    reference_id: "AX-" + code,
    log_channel_id: "log-channel",
    log_message_id: "log-message-" + code,
    ...overrides,
  };
}

function makeClient(member) {
  const guild = {
    id: "guild-1",
    name: "Test Server",
    members: {
      async fetch(userId) {
        return userId === member.id ? member : null;
      },
    },
  };
  return {
    guilds: {
      cache: new Map([["guild-1", guild]]),
      async fetch() { return guild; },
    },
  };
}

test("sweeper claims expired rows, updates logged cases, and sends a tagged DM", async () => {
  finalStatus = "expired";
  rows.splice(0, rows.length, makeRow("12345678"), makeRow("12345679", {
    log_channel_id: null,
    log_message_id: null,
  }));
  storeCalls.getByCode.length = 0;
  let updateCalls = 0;
  const sent = [];
  const member = {
    id: "user-12345678",
    async send(payload) { sent.push(payload); },
  };
  const sweeper = createCaseSweeper(makeClient(member), {
    sendLiveUpdate: async (_guild, data) => {
      updateCalls += 1;
      assert.deepEqual(data, {
        logType: "expired",
        caseCode: "12345678",
        referenceId: "AX-12345678",
        userId: "user-12345678",
      });
    },
  });

  const result = await sweeper.sweep();

  assert.equal(result.length, 2);
  assert.deepEqual(storeCalls.claimExpired, { graceSeconds: 120, limit: 50 });
  assert.equal(updateCalls, 1);
  assert.equal(storeCalls.getByCode.length, 1);
  assert.equal(sent.length, 1);
  const payload = sent[0];
  assert.match(payload.embeds[0].data.description, /Verification Expired/);
  const tag = payload.components[0].toJSON().components[0];
  assert.equal(tag.disabled, true);
  assert.equal(tag.label, "- Test Server");
  sweeper.stop();
});

test("never-opened verification cases are marked only and produce no log update or DM", async () => {
  finalStatus = "expired";
  rows.splice(0, rows.length, makeRow("22345678", {
    log_channel_id: null,
    log_message_id: null,
  }));
  storeCalls.getByCode.length = 0;
  let updates = 0;
  let memberFetches = 0;
  const member = {
    id: "user-22345678",
    async send() { throw new Error("never-opened case must not DM"); },
  };
  const guild = makeClient(member).guilds.cache.get("guild-1");
  guild.members.fetch = async () => {
    memberFetches += 1;
    return member;
  };
  const sweeper = createCaseSweeper({ guilds: { cache: new Map([["guild-1", guild]]) } }, {
    sendLiveUpdate: async () => { updates += 1; },
  });

  await sweeper.sweep();

  assert.equal(updates, 0);
  assert.equal(memberFetches, 0);
  assert.equal(storeCalls.getByCode.length, 0);
  sweeper.stop();
});

test("sweeper does not send an expiry DM when a completion callback already finalized the case", async () => {
  rows.splice(0, rows.length, makeRow("32345678"));
  finalStatus = "verified";
  let updates = 0;
  let sends = 0;
  const member = {
    id: "user-32345678",
    async send() { sends += 1; },
  };
  const sweeper = createCaseSweeper(makeClient(member), {
    sendLiveUpdate: async () => { updates += 1; },
  });

  await sweeper.sweep();

  assert.equal(updates, 1);
  assert.equal(sends, 0);
  assert.deepEqual(storeCalls.getByCode.at(-1), {
    guildId: "guild-1",
    code: "32345678",
  });
  sweeper.stop();
});

test.after(() => {
  if (previousDb) require.cache[dbPath] = previousDb;
  else delete require.cache[dbPath];
  delete require.cache[require.resolve("../src/utils/liveUpdate")];
  delete require.cache[require.resolve("../src/utils/caseSweeper")];
});


test("expiry is mark-only and the unref'd 60-second sweeper prevents overlapping runs", async () => {
  assert.equal(EXPIRED_ACTION, "mark");
  let scheduled;
  let intervalMs = null;
  let unrefCalled = false;
  let clearCalled = false;
  let claimCalls = 0;
  let releaseClaim;
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  const sweeper = createCaseSweeper({ guilds: { cache: new Map() } }, {
    claimExpired: async () => {
      claimCalls += 1;
      resolveStarted();
      return new Promise((resolve) => { releaseClaim = resolve; });
    },
    sendLiveUpdate: async () => {},
    setInterval(callback, ms) {
      scheduled = callback;
      intervalMs = ms;
      return { unref() { unrefCalled = true; } };
    },
    clearInterval() { clearCalled = true; },
  });

  sweeper.start();
  await started;
  assert.equal(intervalMs, 60_000);
  assert.equal(unrefCalled, true);
  await sweeper.sweep();
  assert.equal(claimCalls, 1, "overlapping sweeps must not claim rows twice");

  releaseClaim([]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof scheduled, "function");
  sweeper.stop();
  assert.equal(clearCalled, true);
});
