const test = require("node:test");
const assert = require("node:assert/strict");
const { caseKey, pruneCaseStore } = require("../src/utils/liveUpdate");

test("verification cases are isolated by reference ID when supplied", () => {
  const guild = { id: "guild-1" };
  assert.notEqual(
    caseKey(guild, { member: { id: "user-1" }, referenceId: "AX-CASE-A" }),
    caseKey(guild, { member: { id: "user-1" }, referenceId: "AX-CASE-B" }),
  );
  assert.equal(
    caseKey(guild, { member: { id: "user-1" }, referenceId: "AX-CASE-A" }),
    "guild-1:ref:AX-CASE-A",
  );
});

test("case cache removes expired entries", () => {
  const now = 1_000_000;
  const store = new Map([
    ["expired", { lastUpdatedAt: now - 30 * 60 * 1000 - 1 }],
    ["active", { lastUpdatedAt: now - 1_000 }],
  ]);
  pruneCaseStore(store, now);
  assert.deepEqual([...store.keys()], ["active"]);
});

test("case cache stays bounded and evicts the oldest active cases", () => {
  const now = 1_000_000;
  const store = new Map();
  for (let index = 0; index < 5_001; index += 1) {
    store.set(String(index), { lastUpdatedAt: now - index });
  }
  pruneCaseStore(store, now);
  assert.equal(store.size, 5_000);
  assert.equal(store.has("5000"), false);
});
