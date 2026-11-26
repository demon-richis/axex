function createReviewWorkflow(dependencies) {
  const {
    caseStore,
    quarantineMember,
    approveMember,
    banMember,
    updatePortal,
    flagAccount,
    sendLiveUpdate,
    logAction,
  } = dependencies;

  async function apply({ guild, member, config, caseRow, action, actorId, actorTag }) {
    const claimed = await caseStore.claimReviewAction({
      guildId: guild.id,
      caseCode: caseRow.case_code,
      action,
      actorId,
    });
    if (!claimed) return { resolved: false };

    const reason = `Manual review ${action} by ${actorTag || actorId}`;
    try {
      if (action === "approve") {
        await updatePortal(guild.id, member.id, "approve");
        await approveMember(member, config);
      } else if (action === "ban") {
        await flagAccount(member.id, reason, actorId);
        await updatePortal(guild.id, member.id, "ban");
        await banMember(member, reason);
      } else {
        await updatePortal(guild.id, member.id, action === "timeout" ? "deny" : action);
        await quarantineMember(member, config, reason, {
          referenceId: caseRow.reference_id,
          caseCode: caseRow.case_code,
          action: action === "timeout" ? "REVIEW_TIMEOUT_QUARANTINED" : "REVIEW_DENIED",
        });
      }

      const finalStatus = action === "approve" ? "verified" : "quarantined";
      const finished = await caseStore.finishReviewAction({
        id: caseRow.id,
        action,
        actorId,
        status: finalStatus,
      });
      if (!finished) throw new Error("Could not finalize the manual review case");
      await logAction({
        guildId: guild.id,
        userId: member.id,
        referenceId: caseRow.reference_id,
        action: `VERIFICATION_REVIEW_${action.toUpperCase()}`,
        reason,
        actorId,
      });
      await sendLiveUpdate(guild, {
        logType: "reviewResolved",
        member,
        referenceId: caseRow.reference_id,
        caseCode: caseRow.case_code,
        action: `VERIFICATION_REVIEW_${action.toUpperCase()}`,
        reason,
        review: { action, actorId },
      });
      return { resolved: true, status: finalStatus };
    } catch (error) {
      await caseStore.releaseReviewAction(claimed.id, action, error?.message);
      throw error;
    }
  }

  return { apply };
}

async function updatePortalReview(guildId, userId, reviewAction) {
  const { getPortalApiKey } = require("../config/runtime");
  const websiteUrl = require("./websiteUrl");
  const response = await fetch(websiteUrl("/api/bot/release"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getPortalApiKey(),
    },
    body: JSON.stringify({ guildId, userId, reviewAction }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Portal manual review update failed (HTTP ${response.status})`);
  }
}

module.exports = { createReviewWorkflow, updatePortalReview };
