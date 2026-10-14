const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const net = require("node:net");
const { once } = require("node:events");
const { before, after, test } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { createVerificationCallbackStore } = require("../src/db/verificationCallbackStore");

const apiKey = "local-test-api-key-only";
const roles = { removeCalls: 0, addCalls: 0, failNextAdd: false, holdNextAdd: false };
const metrics = { quarantine: 0, recordAction: 0, events: 0, audit: 0, retryJobs: [] };
const auditEventIds = new Set();
const actionEventIds = new Set();
let db;
let store;
let failNextComplete = false;
let server;
let baseUrl;
let requestCount = 0;
let roleAddStarted;
let releaseRoleAdd;

function makeSqlTag(database) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await database.query(text, values)).rows;
  };
}

const config = {
  verified_role_id: "role-verified",
  unverified_role_id: "role-unverified",
  log_channel_id: null,
};

function makeGuild(guildId) {
  const members = new Map();
  const guild = {
    id: guildId,
    members: {
      fetch: async (userId) => members.get(userId) || null,
    },
    channels: { cache: new Map(), fetch: async () => null },
  };
  guild.addMember = (userId) => {
    const roleIds = new Set(["role-unverified"]);
    const member = {
      id: userId,
      guild,
      user: { tag: `mock-${userId}`, createdTimestamp: Date.now() - 10 * 86_400_000 },
      roles: {
        cache: { has: (roleId) => roleIds.has(roleId) },
        remove: async () => {
          roles.removeCalls += 1;
          roleIds.delete("role-unverified");
        },
        add: async () => {
          roles.addCalls += 1;
          if (roles.failNextAdd) {
            roles.failNextAdd = false;
            throw new Error("mock Discord role failure");
          }
          if (roles.holdNextAdd) {
            roles.holdNextAdd = false;
            roleAddStarted();
            await new Promise((resolve) => {
              releaseRoleAdd = resolve;
            });
          }
          roleIds.add("role-verified");
        },
      },
      fetch: async () => member,
      send: async () => {},
    };
    members.set(userId, member);
    return member;
  };
  return guild;
}

const guilds = new Map();
const guild1 = makeGuild("guild-test");
const guild2 = makeGuild("guild-other");
guilds.set(guild1.id, guild1);
guilds.set(guild2.id, guild2);
for (const id of ["user-test", "user-other", "user-concurrent", "user-db-failure", "user-role-failure", "user-quarantine"]) {
  guild1.addMember(id);
}
guild2.addMember("user-test");

const dbMocks = {
  getGuildConfig: async () => config,
  getGuildState: async () => ({ raid_mode: false, event_mode: false }),
  logVerificationEvent: async (data) => {
    const eventId = data.eventId || `mock-${metrics.audit + 1}`;
    if (!auditEventIds.has(eventId)) {
      auditEventIds.add(eventId);
      metrics.audit += 1;
    }
    return { eventId };
  },
  claimVerificationCallback: (...args) => store.claim(...args),
  completeVerificationCallback: async (...args) => {
    if (failNextComplete) {
      failNextComplete = false;
      throw new Error("simulated callback receipt write failure");
    }
    return store.complete(...args);
  },
  retryVerificationCallback: (...args) => store.retryable(...args),
  completeVerificationCallbackAfterRoleRetry: (...args) => store.completeAfterRoleRetry(...args),
  completeRoleUpdateRetriesForReference: async () => true,
  createRoleUpdateRetry: async (data) => {
    metrics.retryJobs.push(data);
    return metrics.retryJobs.length;
  },
  getPendingRoleUpdateRetries: async () => [],
  completeRoleUpdateRetry: async () => true,
  failRoleUpdateRetry: async () => true,
};

const verificationMocks = {
  accountAgeDays: () => 10,
  quarantineUser: async (_member, _config, _reason, options) => {
    const eventId = options.eventId;
    if (!actionEventIds.has(eventId)) {
      actionEventIds.add(eventId);
      metrics.quarantine += 1;
    }
  },
  recordAction: async (_member, _state, data) => {
    if (!actionEventIds.has(data.eventId)) {
      actionEventIds.add(data.eventId);
      metrics.recordAction += 1;
    }
  },
};
const intelligenceMocks = {
  recordEvent: async () => {
    metrics.events += 1;
  },
};

function installMockModule(relativePath, exports) {
  const filename = require.resolve(relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

function body(overrides = {}) {
  return {
    guildId: "guild-test",
    userId: "user-test",
    referenceId: "AX-ABCD1234",
    passed: true,
    vpnDetected: false,
    accountAgeDays: 200,
    clickMs: 1100,
    attempts: 1,
    locked: false,
    ...overrides,
  };
}

async function post(payload, key = apiKey, extraHeaders = {}) {
  requestCount += 1;
  const response = await fetch(`${baseUrl}/webhook/verify-result`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { "x-api-key": key } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  return { status: response.status, json: await response.json() };
}

before(async () => {
  process.env.AXEX_BOT_API_KEY = apiKey;
  const schema = fs.readFileSync(require.resolve("../src/db/schema.sql"), "utf8");
  db = new PGlite();
  await db.exec(schema);
  store = createVerificationCallbackStore(() => makeSqlTag(db));
  installMockModule("../src/db/client", dbMocks);
  installMockModule("../src/verification/verifySystem", verificationMocks);
  installMockModule("../src/utils/intelligenceClient", intelligenceMocks);

  const client = {
    isReady: () => true,
    guilds: {
      fetch: async (guildId) => guilds.get(guildId) || null,
      cache: { size: guilds.size },
    },
  };
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  process.env.WEBHOOK_PORT = String(port);
  const receiver = require("../src/utils/webhookReceiver");
  server = receiver.startWebhookReceiver(client);
  if (!server.listening) await once(server, "listening");
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});

test("webhook authentication and reference validation fail closed", async () => {
  const noKey = await post(body({ referenceId: "AX-ABCD1234" }), null);
  assert.equal(noKey.status, 401);
  const wrongKey = await post(body({ referenceId: "AX-ABCD1234" }), "wrong");
  assert.equal(wrongKey.status, 401);
  const invalidReference = await post(body({ referenceId: "forged-reference" }));
  assert.equal(invalidReference.status, 400);
  assert.equal(invalidReference.json.code, "INVALID_REFERENCE_ID");
  assert.equal(roles.addCalls, 0);
});

test("valid callback grants roles once and sequential duplicate is idempotent", async () => {
  const payload = body({ referenceId: "AX-ABCD1234" });
  const beforeAdds = roles.addCalls;
  const first = await post(payload);
  assert.equal(first.status, 200);
  assert.equal(first.json.passed, true);
  assert.equal(roles.addCalls, beforeAdds + 1);

  const duplicate = await post(payload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.idempotent, true);
  assert.equal(roles.addCalls, beforeAdds + 1);
});

test("same reference with changed user, guild, or result cannot trigger side effects", async () => {
  const referenceId = "AX-ABCD1235";
  const first = await post(body({ referenceId }));
  assert.equal(first.status, 200);
  const beforeAdds = roles.addCalls;
  const changedUser = await post(body({ referenceId, userId: "user-other" }));
  const changedGuild = await post(body({ referenceId, guildId: "guild-other" }));
  const changedResult = await post(body({ referenceId, passed: false }));
  for (const response of [changedUser, changedGuild, changedResult]) {
    assert.equal(response.status, 409);
    assert.equal(response.json.code, "CALLBACK_REFERENCE_CONFLICT");
  }
  assert.equal(roles.addCalls, beforeAdds);
  assert.equal(metrics.quarantine, 0);
});

test("concurrent identical callbacks have only one active processor", async () => {
  const payload = body({ referenceId: "AX-ABCD1236", userId: "user-concurrent" });
  roles.holdNextAdd = true;
  const started = new Promise((resolve) => {
    roleAddStarted = resolve;
  });
  const firstPromise = post(payload);
  await started;
  const second = await post(payload);
  assert.equal(second.status, 409);
  assert.equal(second.json.code, "CALLBACK_IN_PROGRESS");
  releaseRoleAdd();
  const first = await firstPromise;
  assert.equal(first.status, 200);
});

test("database completion failure leaves a retryable receipt rather than consuming it", async () => {
  const payload = body({ referenceId: "AX-ABCD1237", userId: "user-db-failure" });
  const beforeAdds = roles.addCalls;
  const beforeRemoves = roles.removeCalls;
  const beforeActions = metrics.recordAction;
  failNextComplete = true;
  const failed = await post(payload);
  assert.equal(failed.status, 500);
  const retry = await post(payload);
  assert.equal(retry.status, 200);
  assert.equal(retry.json.passed, true);
  assert.equal(roles.addCalls, beforeAdds + 1);
  assert.equal(roles.removeCalls, beforeRemoves + 1);
  assert.equal(metrics.recordAction, beforeActions + 1);
});

test("Discord role failure queues recovery and a redelivery completes without repeating prior role work", async () => {
  const payload = body({ referenceId: "AX-ABCD1239", userId: "user-role-failure" });
  const beforeAdds = roles.addCalls;
  const beforeRemoves = roles.removeCalls;
  const beforeRetries = metrics.retryJobs.length;
  roles.failNextAdd = true;

  const failed = await post(payload);
  assert.equal(failed.status, 502);
  assert.equal(metrics.retryJobs.length, beforeRetries + 1);

  const recovered = await post(payload);
  assert.equal(recovered.status, 200);
  assert.equal(roles.addCalls, beforeAdds + 2);
  assert.equal(roles.removeCalls, beforeRemoves + 1);
});

test("a failed result is quarantined once and replay does not repeat moderation", async () => {
  const payload = body({
    referenceId: "AX-ABCD1238",
    userId: "user-quarantine",
    passed: false,
    attempts: 1,
    locked: false,
  });
  const before = metrics.quarantine;
  const first = await post(payload);
  assert.equal(first.status, 200);
  assert.equal(first.json.passed, false);
  assert.equal(metrics.quarantine, before + 1);

  const duplicate = await post(payload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.idempotent, true);
  assert.equal(metrics.quarantine, before + 1);
});

test("spoofed X-Forwarded-For cannot evade the per-peer webhook rate limit", async () => {
  const remaining = Math.max(0, 30 - requestCount);
  for (let i = 0; i < remaining; i += 1) {
    await post(body({ referenceId: `AX-${String(i).padStart(8, "0")}` }), "invalid", {
      "x-forwarded-for": `198.51.100.${i + 1}`,
    });
  }
  const limited = await post(body({ referenceId: "AX-FFFFFFFE" }), "invalid", {
    "x-forwarded-for": "203.0.113.77",
  });
  assert.equal(limited.status, 429);
});
