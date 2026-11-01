const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const webhookSource = fs.readFileSync(path.join(root, "src/utils/webhookReceiver.js"), "utf8");
const sweeperSource = fs.readFileSync(path.join(root, "src/utils/caseSweeper.js"), "utf8");

test("every verification callback DM is wrapped with the originating server tag", () => {
  const calls = [...webhookSource.matchAll(/member\s*\.send\(\s*withServerTag\(guild/g)];
  assert.equal(calls.length, 2, "success and failed/locked DMs must both be server-tagged");
  assert.match(webhookSource, /embeds\.replies\.success\(guild\.name\)/);
  assert.match(webhookSource, /verificationLocked\(attempts/);
  assert.match(webhookSource, /verificationFailed\(/);
});

test("expiry DM includes the server tag and server-specific expiry copy", () => {
  assert.match(sweeperSource, /member\.send\(withServerTag\(guild,/);
  assert.match(sweeperSource, /replies\.verificationExpired\(guild\.name\)/);
});
