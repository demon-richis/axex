const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCaseInput } = require("../src/commands/verificationLog");
const { commands } = require("../src/deploy-commands");

test("verification-log validator accepts eight-digit Case IDs", () => {
  assert.deepEqual(validateCaseInput("48151623"), {
    valid: true,
    kind: "caseCode",
    value: "48151623",
  });
  assert.deepEqual(validateCaseInput("  48151623  "), {
    valid: true,
    kind: "caseCode",
    value: "48151623",
  });
});

test("verification-log validator accepts legacy AX references from 8 to 32 characters", () => {
  assert.equal(validateCaseInput("AX-1A2B3C4D").kind, "legacy");
  assert.equal(validateCaseInput(" ax-1234567890abcdef1234567890ABCDEF ").value,
    "AX-1234567890ABCDEF1234567890ABCDEF");
  assert.equal(validateCaseInput("AX-1234567").valid, false);
  assert.equal(validateCaseInput("AX-" + "A".repeat(33)).valid, false);
});

test("verification-log validator rejects malformed and overlong values but permits an empty filter", () => {
  for (const value of ["1234567", "123456789", "AX-!!!!!!!!!", "not-a-case", "  broken  "]) {
    assert.equal(validateCaseInput(value).valid, false, value);
  }
  assert.deepEqual(validateCaseInput(null), {
    valid: true,
    kind: "empty",
    value: "",
  });
});

test("slash command exposes the agreed reference length bounds", () => {
  const command = commands.find((item) => item.name === "verification-log");
  assert.ok(command, "verification-log command must be registered");
  const reference = command.options.find((option) => option.name === "reference");
  assert.ok(reference, "reference option must be registered");
  assert.equal(reference.min_length, 8);
  assert.equal(reference.max_length, 35);
  assert.match(reference.description, /8-digit Case ID/i);
});
