const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_VERIFICATION_POLICY,
  buildVerificationPolicy,
} = require("../src/utils/verificationPolicy");

test("legacy guild settings map to the policy contract", () => {
  assert.deepEqual(buildVerificationPolicy({
    min_account_age: 14,
    verify_timeout: 120,
    vpn_check_enabled: false,
    honeypot_enabled: false,
    new_account_action: "strict",
    suspicious_action: "quarantine",
  }), {
    ...DEFAULT_VERIFICATION_POLICY,
    newAccountDays: 14,
    verifyTimeoutSeconds: 120,
    vpnAction: "allow",
    honeypotAction: "flag",
    newAccountAction: "raise_level",
    raidAction: "force_review_new_accounts",
  });
});

test("missing legacy settings preserve current verification behavior", () => {
  assert.deepEqual(buildVerificationPolicy({}), DEFAULT_VERIFICATION_POLICY);
});

test("policy bounds prevent unsafe legacy values", () => {
  const policy = buildVerificationPolicy({ min_account_age: 9999, verify_timeout: 1 });
  assert.equal(policy.newAccountDays, 365);
  assert.equal(policy.verifyTimeoutSeconds, 15);
});

test("settings embed exposes all mapped policy controls", () => {
  const embeds = require("../src/config/messages");
  const description = embeds.setup.settings({
    max_attempts: 2,
    cooldown_seconds: "60 / 3600",
    vpn_check_enabled: false,
    honeypot_enabled: true,
    min_account_age: 14,
    new_account_action: "strict",
    verify_timeout: 120,
    review_enabled: true,
    suspicious_action: "quarantine",
    auto_verify_enabled: true,
    member_role_ids: ["role-1"],
  }).data.description;
  for (const expected of ["Attempts", "Cooldowns", "VPN action", "Honeypot", "New account", "Verify timeout", "Review", "Raid action", "Auto verify", "Member roles"]) {
    assert.match(description, new RegExp(expected));
  }
});
