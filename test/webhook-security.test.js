const { after, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");

process.env.AXEX_BOT_API_KEY = "test-only-secret-not-a-real-credential";
const { app } = require("../src/utils/webhookReceiver");
const server = app.listen(0, "127.0.0.1");

after(async () => {
  server.close();
  await once(server, "close");
});

function request(path, { headers = {}, body, method = "POST" } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        headers: {
          ...(payload ? { "content-type": "application/json" } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("public health endpoint reports bounded readiness data without guild counts", async () => {
  const result = await request("/health", { method: "GET" });
  assert.equal(result.status, 200);
  const health = JSON.parse(result.body);
  assert.equal(health.service, "axex-bot-webhook");
  assert.equal(health.ready, false);
  assert.equal(typeof health.checkedAt, "string");
  assert.equal("guilds" in health, false);
});

test("verification callback rejects requests without the shared API key", async () => {
  const result = await request("/webhook/verify-result", {
    body: { guildId: "12345678901234567", userId: "12345678901234568", passed: true },
  });
  assert.equal(result.status, 401);
  assert.equal(JSON.parse(result.body).error, "Unauthorized");
});

test("verification callback accepts the directional portal-to-bot key", async () => {
  process.env.PORTAL_TO_BOT_KEY = "directional-test-secret-not-real";
  const result = await request("/webhook/verify-result", {
    headers: { "x-api-key": process.env.PORTAL_TO_BOT_KEY },
    body: { guildId: "12345678901234567", userId: "12345678901234568", passed: "true" },
  });
  assert.equal(result.status, 400);
  assert.equal(JSON.parse(result.body).code, "INVALID_VERIFY_RESULT");
  const legacy = await request("/webhook/verify-result", {
    headers: { "x-api-key": process.env.AXEX_BOT_API_KEY },
    body: { guildId: "12345678901234567", userId: "12345678901234568", passed: "true" },
  });
  assert.equal(legacy.status, 400, "legacy shared key remains accepted during rotation");
  delete process.env.PORTAL_TO_BOT_KEY;
});

test("verification callback rejects malformed authenticated result payloads", async () => {
  const result = await request("/webhook/verify-result", {
    headers: { "x-api-key": process.env.AXEX_BOT_API_KEY },
    body: { guildId: "12345678901234567", userId: "12345678901234568", passed: "true" },
  });
  assert.equal(result.status, 400);
  assert.equal(JSON.parse(result.body).code, "INVALID_VERIFY_RESULT");
});

test("authenticated requests are rate-limited independently per guild", async () => {
  const guildId = "rate-limit-guild";
  for (let i = 0; i < 30; i += 1) {
    const result = await request("/webhook/verify-result", {
      headers: { "x-api-key": process.env.AXEX_BOT_API_KEY },
      body: { guildId, userId: `user-${i}`, passed: "true" },
    });
    assert.equal(result.status, 400, `request ${i + 1} should reach payload validation`);
  }
  const limited = await request("/webhook/verify-result", {
    headers: { "x-api-key": process.env.AXEX_BOT_API_KEY },
    body: { guildId, userId: "limited-user", passed: "true" },
  });
  assert.equal(limited.status, 429);
  assert.equal(JSON.parse(limited.body).error, "Rate limit exceeded");

  const separateGuild = await request("/webhook/verify-result", {
    headers: { "x-api-key": process.env.AXEX_BOT_API_KEY },
    body: { guildId: "separate-guild", userId: "separate-user", passed: "true" },
  });
  assert.equal(separateGuild.status, 400);
});
