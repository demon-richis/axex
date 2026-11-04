const test = require("node:test");
const assert = require("node:assert/strict");
const logs = require("../src/config/messages/logs");
const E = require("../src/verification/emojis");

const sections = ["intelligence", "user", "details", "timeline", "network", "errors"];
const state = {
  caseCode: "74633148",
  referenceId: "AX-74633148",
  userId: "1486679343009632287",
  userTag: "amaira.xyz",
  userCreatedTimestamp: 1_700_000_000_000,
  userJoinedTimestamp: 1_762_000_000_000,
  accountAge: 412,
  status: "verified",
  clickMs: 2800,
  intelligence: {
    riskLevel: "CLEAN", riskScore: 1, recommendation: "ALLOW", confidence: "MEDIUM",
    reasons: ["DEFAULT_AVATAR_WAVE", "IP_LOOKUP_FAILED 198.51.100.8", "2001:db8::1"],
  },
  flags: { vpn: false, ipFlagged: false, honeypot: false, botDetected: false, networkSignals: ["198.51.100.8", "2001:db8::1"] },
  final: { action: "VERIFIED", attempts: 1, reason: "WEB_VERIFICATION_PASSED 198.51.100.8", clickMs: 2800 },
  errors: [{ stage: "roleUpdate", message: "IP_LOOKUP_FAILED 2001:db8::1" }],
};

test("each section has the branded heading, Case ID, status color, and no IP or lookup-failure text", () => {
  for (const section of sections) {
    const embed = logs.verificationSection(state, section, [
      { action: "VERIFIED", reason: "IP_LOOKUP_FAILED 198.51.100.8 2001:db8::1", created_at: new Date() },
    ]).toJSON();
    const description = embed.description;
    assert.match(description, /__\*\*[^\n]+\*\*__/i, section);
    assert.match(description, /\*\*Case ID:\*\* `74633148`/, section);
    assert.equal(embed.color, 0x57f287, section);
    assert.doesNotMatch(description, /(?:\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b|IP_LOOKUP_FAILED)/i, section);
    assert.match(description, /<:[a-z0-9_]+:\d+>/i, section);
  }
});

test("disabled verification dropdown has the expired placeholder and cannot be selected", () => {
  const row = logs.verificationCaseComponents(state, { disabled: true })[0].toJSON();
  assert.equal(row.components[0].disabled, true);
  assert.equal(row.components[0].placeholder, "Expired · use /verification-log");
});

test("menuExpired gives an Axex-styled 24-hour notice and case code", () => {
  const embed = logs.menuExpired("74633148").toJSON();
  assert.match(embed.description, /__\*\*Log Menu Expired\*\*__/);
  assert.match(embed.description, /24 hours/);
  assert.match(embed.description, /`74633148`/);
  assert.match(embed.description, new RegExp(E.timeout.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
