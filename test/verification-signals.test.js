const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildVerificationSignals,
  profileSignals,
} = require("../src/utils/verificationSignals");

const DAY = 86_400_000;

function makeMember({ ageDays = 30, avatar = "avatar", ...userFields } = {}) {
  const now = Date.now();
  return {
    user: {
      createdTimestamp: now - ageDays * DAY,
      avatar,
      ...userFields,
    },
  };
}

test("critical signals take precedence over every lower level", () => {
  for (const intelligence of [
    { reasons: ["KNOWN_BAD_IP"] },
    { reasons: ["BLOCKLIST_HIT"] },
    { reasons: ["SAME_IP_AS_FLAGGED"] },
  ]) {
    assert.equal(
      buildVerificationSignals({
        member: makeMember(),
        config: {},
        state: {},
        intelligence,
      }).level,
      "critical",
    );
  }
});

test("high and medium levels follow account-age, alt, raid, avatar, and recommendation rules", () => {
  assert.equal(
    buildVerificationSignals({
      member: makeMember({ ageDays: 0, avatar: null }),
      config: {},
      state: {},
    }).level,
    "high",
  );
  assert.equal(
    buildVerificationSignals({
      member: makeMember(),
      config: {},
      state: {},
      intelligence: { reasons: ["FLAGGED_USER_ALT"] },
    }).level,
    "high",
  );
  assert.equal(
    buildVerificationSignals({
      member: makeMember(),
      config: { raid_threshold: 5 },
      state: { raid_mode: true },
      recentJoinCount: 5,
    }).level,
    "high",
  );
  assert.equal(
    buildVerificationSignals({
      member: makeMember({ ageDays: 3 }),
      config: { min_account_age: 7 },
      state: {},
    }).level,
    "medium",
  );
  assert.equal(
    buildVerificationSignals({
      member: makeMember(),
      config: {},
      state: {},
      intelligence: { recommendation: "challenge" },
    }).level,
    "medium",
  );
});

test("low is the baseline and only an eligible decoration candidate is initially auto", () => {
  const low = buildVerificationSignals({
    member: makeMember(),
    config: {},
    state: {},
  });
  assert.equal(low.level, "low");

  const candidate = buildVerificationSignals({
    member: makeMember({ ageDays: 2, avatarDecorationData: { asset: "decoration" } }),
    config: { auto_verify_enabled: true },
    state: {},
  });
  assert.equal(candidate.level, "auto");
  assert.equal(candidate.autoCandidate, true);
  assert.equal(candidate.profileSignals.avatarDecoration, true);

  const youngCandidate = buildVerificationSignals({
    member: makeMember({ ageDays: 0, avatarDecorationData: { asset: "decoration" } }),
    config: { auto_verify_enabled: true },
    state: {},
  });
  assert.equal(youngCandidate.autoCandidate, true);
  assert.notEqual(youngCandidate.level, "auto");
});

test("Discord profile features are optional and throwing accessors do not crash", () => {
  const user = {};
  Object.defineProperty(user, "avatarDecorationData", {
    get() {
      throw new Error("not supported");
    },
  });
  Object.defineProperty(user, "avatarDecorationURL", {
    get() {
      throw new Error("not supported");
    },
  });
  assert.deepEqual(profileSignals(user), {});
});
