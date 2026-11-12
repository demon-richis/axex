const test = require("node:test");
const assert = require("node:assert/strict");
const { Session, sendAlert } = require("../scripts/botdb/lib/session");

test("session expires by idle time and total duration", () => {
  let now = 0;
  const session = new Session(300, 100, () => now);
  now = 99;
  assert.equal(session.expired(), false);
  now = 101;
  assert.equal(session.expired(), true);
});

test("webhook failures are retried and tolerated", async () => {
  let calls = 0;
  const ok = await sendAlert("https://example.invalid", { command: "test" }, async () => {
    calls += 1;
    throw new Error("offline");
  });
  assert.equal(ok, false);
  assert.equal(calls, 2);
});
