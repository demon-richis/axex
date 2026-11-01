const test = require("node:test");
const assert = require("node:assert/strict");
const logs = require("../src/config/messages/logs");
const E = require("../src/verification/emojis");

function optionValues(row) {
  return row.toJSON().components[0].options.map((option) => option.value);
}

test("verification log embed stays compact with only the user, Case ID, and status", () => {
  const embed = logs.verificationCase({
    caseCode: "48151623",
    userId: "123456789012345678",
    userTag: "Member#1234",
    status: "verified",
  }).toJSON();

  assert.equal(embed.fields, undefined);
  assert.match(embed.description, /SUCCESS/);
  assert.match(embed.description, /48151623/);
  assert.match(embed.description, /Member#1234/);
  assert.match(embed.description, /<@123456789012345678>/);
  assert.doesNotMatch(embed.description, /User ID|Account Intelligence|Verification Details/);
  assert.ok(embed.description.split("\n").length <= 3);
});

test("verification log embed renders EXPIRED as a distinct status", () => {
  const embed = logs.verificationCase({
    caseCode: "48151623",
    userId: "123456789012345678",
    userTag: "Member#1234",
    status: "expired",
    expired: true,
  }).toJSON();

  assert.match(embed.description, /EXPIRED/);
  assert.ok(embed.description.startsWith(E.timeout));
});

test("dropdown includes only sections with available data and uses the Case ID custom ID", () => {
  const rows = logs.verificationCaseComponents({
    caseCode: "48151623",
    summary: {
      intelligence: {
        riskScore: 14,
        riskLevel: "low",
        recommendation: "allow",
        confidence: "high",
        reasons: ["normal account"],
      },
      user: {
        id: "123456789012345678",
        tag: "Member#1234",
      },
      flags: {
        vpn: false,
        ipFlagged: false,
        honeypot: false,
      },
      errors: [{ stage: "role", message: "missing permission" }],
    },
    status: "in_progress",
    referenceId: "AX-12345678",
  });

  assert.equal(rows.length, 1);
  const menu = rows[0].toJSON().components[0];
  assert.equal(menu.custom_id, "vlog:48151623");
  assert.equal(menu.placeholder, "View logs...");
  assert.deepEqual(
    menu.options.map((option) => option.value),
    ["intelligence", "user", "details", "timeline", "network", "errors"],
  );
});

test("dropdown omits sections that have no data", () => {
  const rows = logs.verificationCaseComponents({
    caseCode: "48151623",
    summary: {
      intelligence: {
        riskScore: 2,
        riskLevel: "low",
        recommendation: "allow",
        confidence: "high",
      },
    },
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(optionValues(rows[0]), ["intelligence"]);
  assert.deepEqual(logs.verificationCaseComponents({ caseCode: "48151623" }), []);
  assert.deepEqual(logs.verificationCaseComponents({ caseCode: "legacy-ref" }), []);
});

test("network section never renders raw IP values or IP_LOOKUP_FAILED", () => {
  const embed = logs.verificationSection({
    caseCode: "48151623",
    summary: {
      flags: {
        vpn: true,
        ipFlagged: true,
        honeypot: false,
        botDetected: false,
        networkSignals: [
          "VPN proxy detected",
          "IP_LOOKUP_FAILED: 203.0.113.42",
          "Provider returned 2001:db8::5",
        ],
      },
    },
  }, "network").toJSON();

  assert.match(embed.description, /VPN \/ proxy/);
  assert.match(embed.description, /Detected/);
  assert.match(embed.description, /IP addresses are never shown in Discord/);
  assert.doesNotMatch(embed.description, /203\.0\.113\.42/);
  assert.doesNotMatch(embed.description, /2001:db8::5/i);
  assert.doesNotMatch(embed.description, /IP_LOOKUP_FAILED/i);
});
