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

function request(path, { headers = {}, body } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path,
        method: "POST",
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

test("untrusted X-Forwarded-For cannot rotate webhook rate-limit buckets", async () => {
  // Three requests to this socket have already occurred in earlier tests, so
  // 27 more reach the per-minute allowance of 30.
  for (let i = 0; i < 27; i += 1) {
    const result = await request("/webhook/verify-result", {
      headers: { "x-forwarded-for": `198.51.100.${i + 1}` },
      body: {},
    });
    assert.equal(result.status, 401, `request ${i + 1} should reach authentication`);
  }
  const limited = await request("/webhook/verify-result", {
    headers: { "x-forwarded-for": "203.0.113.254" },
    body: {},
  });
  assert.equal(limited.status, 429);
  assert.equal(JSON.parse(limited.body).error, "Rate limit exceeded");
});
