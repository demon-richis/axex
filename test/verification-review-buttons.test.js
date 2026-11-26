const test = require("node:test");
const assert = require("node:assert/strict");
const { verificationCaseComponents, statusFor } = require("../src/config/messages/logs");

test("manual review case exposes Approve, Deny, and Ban buttons", () => {
  const rows = verificationCaseComponents({
    caseCode: "12345678",
    status: "pending_review",
    referenceId: "AX-12345678",
    summary: { review: { timeoutHours: 24 } },
  });
  assert.equal(statusFor({ status: "pending_review" }), "REVIEW");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows[1].toJSON().components.map((button) => button.custom_id),
    [
      "axex_review:approve:12345678",
      "axex_review:deny:12345678",
      "axex_review:ban:12345678",
    ],
  );
  assert.ok(rows[1].toJSON().components.every((button) => button.disabled === false));
});

test("manual review buttons are disabled after a recorded decision", () => {
  const rows = verificationCaseComponents({
    caseCode: "12345678",
    status: "quarantined",
    referenceId: "AX-12345678",
    summary: { review: { action: "deny", actorId: "admin-1" } },
  });
  assert.ok(rows[1].toJSON().components.every((button) => button.disabled === true));
});
