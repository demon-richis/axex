const test = require("node:test");
const assert = require("node:assert/strict");
const { createReviewWorkflow } = require("../src/utils/reviewWorkflow");

for (const action of ["approve", "deny", "ban"]) {
  test(`manual review ${action} action is authorized by a single durable claim`, async () => {
    const calls = [];
    let status = "pending_review";
    const caseStore = {
      async claimReviewAction(input) {
        calls.push(["claim", input]);
        if (status !== "pending_review") return null;
        status = "review_processing";
        return { id: 1 };
      },
      async finishReviewAction(input) {
        calls.push(["finish", input]);
        status = input.status;
        return { id: 1 };
      },
      async releaseReviewAction() {
        status = "pending_review";
      },
    };
    const workflow = createReviewWorkflow({
      caseStore,
      updatePortal: async (_guildId, _userId, value) => calls.push(["portal", value]),
      approveMember: async () => calls.push(["approve"]),
      quarantineMember: async () => calls.push(["quarantine"]),
      flagAccount: async () => calls.push(["flag"]),
      banMember: async () => calls.push(["ban"]),
      logAction: async () => calls.push(["audit"]),
      sendLiveUpdate: async (_guild, data) => calls.push(["log", data]),
    });
    const context = {
      guild: { id: "guild-1" },
      member: { id: "user-1" },
      config: {},
      caseRow: { id: 1, case_code: "12345678", reference_id: "AX-12345678" },
      action,
      actorId: "admin-1",
      actorTag: "admin#0001",
    };

    const result = await workflow.apply(context);
    assert.equal(result.resolved, true);
    assert.equal(status, action === "approve" ? "verified" : "quarantined");
    assert.ok(calls.some(([name]) => name === "log"));
    assert.ok(calls.some(([name]) => name === "audit"));
    assert.equal(calls.some(([name]) => name === "approve"), action === "approve");
    assert.equal(calls.some(([name]) => name === "quarantine"), action === "deny");
    assert.equal(calls.some(([name]) => name === "flag"), action === "ban");
    assert.equal(calls.some(([name]) => name === "ban"), action === "ban");
    assert.equal(
      calls.find(([name]) => name === "portal")[1],
      action,
    );
    const duplicate = await workflow.apply(context);
    assert.equal(duplicate.resolved, false);
  });
}
