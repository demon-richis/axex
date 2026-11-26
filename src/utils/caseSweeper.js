const { caseStore, getGuildConfig, logVerificationEvent } = require("../db/client");
const { sendLiveUpdate, disableCaseMenu } = require("./liveUpdate");
const { withServerTag } = require("./serverTag");
const { updatePortalReview } = require("./reviewWorkflow");
const { quarantineUser } = require("../verification/verifySystem");
const replies = require("../config/messages/replies");

const EXPIRED_ACTION = "mark";

function createCaseSweeper(client, options = {}) {
  const claimExpired = options.claimExpired || caseStore.claimExpired.bind(caseStore);
  const listMenuExpiry = options.listMenuExpiry || caseStore.listMenuExpiry?.bind(caseStore);
  const markMenuDisabled = options.markMenuDisabled || caseStore.markMenuDisabled?.bind(caseStore);
  const claimReviewTimeouts =
    options.claimReviewTimeouts || caseStore.claimReviewTimeouts?.bind(caseStore);
  const finishReviewAction =
    options.finishReviewAction || caseStore.finishReviewAction?.bind(caseStore);
  const releaseReviewAction =
    options.releaseReviewAction || caseStore.releaseReviewAction?.bind(caseStore);
  const claimVerificationReminders =
    options.claimVerificationReminders ||
    caseStore.claimVerificationReminders?.bind(caseStore);
  const finishVerificationReminder =
    options.finishVerificationReminder ||
    caseStore.finishVerificationReminder?.bind(caseStore);
  const claimMemberVerificationTimeouts =
    options.claimMemberVerificationTimeouts ||
    caseStore.claimMemberVerificationTimeouts?.bind(caseStore);
  const finishMemberVerificationTimeout =
    options.finishMemberVerificationTimeout ||
    caseStore.finishMemberVerificationTimeout?.bind(caseStore);
  const releaseMemberVerificationTimeout =
    options.releaseMemberVerificationTimeout ||
    caseStore.releaseMemberVerificationTimeout?.bind(caseStore);
  const updatePortal = options.updatePortalReview || updatePortalReview;
  const getGuildConfiguration = options.getGuildConfig || getGuildConfig;
  const quarantineMember = options.quarantineMember || quarantineUser;
  const logReviewAction = options.logReviewAction || logVerificationEvent;
  const disableMenu = options.disableCaseMenu || disableCaseMenu;
  const menuCheckEveryMs = Math.max(0, Number(options.menuCheckEveryMs ?? 5 * 60_000));
  const now = options.now || Date.now;
  // Tests that only inject claimExpired must not touch the real database for menu expiry.
  const menuSweepEnabled = Boolean(listMenuExpiry && markMenuDisabled) &&
    (Boolean(options.listMenuExpiry) || !options.claimExpired);
  const reviewSweepEnabled = Boolean(
    claimReviewTimeouts && finishReviewAction && releaseReviewAction,
  ) && (Boolean(options.claimReviewTimeouts) || !options.claimExpired);
  const memberTimeoutSweepEnabled = Boolean(
    claimVerificationReminders &&
      finishVerificationReminder &&
      claimMemberVerificationTimeouts &&
      finishMemberVerificationTimeout &&
      releaseMemberVerificationTimeout,
  ) && (Boolean(options.claimVerificationReminders) || !options.claimExpired);
  let lastMenuCheck = 0;
  const updateLog = options.sendLiveUpdate || sendLiveUpdate;
  const intervalMs = Math.max(10_000, Number(options.intervalMs) || 60_000);
  const graceSeconds = Math.max(0, Number(options.graceSeconds ?? 120));
  const timerFactory = options.setInterval || setInterval;
  const clearTimer = options.clearInterval || clearInterval;
  let timer = null;
  let running = false;
  let stopped = false;

  // Disables the #axex-logs dropdown 24 hours after the case was created.
  // The case is only marked as done after Discord confirms the edit (or the message is gone),
  // so a failed edit is retried on the next check.
  async function sweepMenus() {
    const rows = await listMenuExpiry({ olderThanHours: 24, limit: 25 });
    for (const row of rows) {
      const guild = client.guilds.cache.get(row.guild_id) ||
        (await client.guilds.fetch(row.guild_id).catch(() => null));
      const outcome = guild ? await disableMenu(guild, row) : "missing";
      if (outcome === "disabled" || outcome === "missing") {
        await markMenuDisabled(row.id);
      }
    }
    return rows;
  }

  async function sweepReviewTimeouts() {
    const rows = await claimReviewTimeouts({ limit: 25 });
    for (const row of rows) {
      try {
        const guild = client.guilds.cache.get(row.guild_id) ||
          (await client.guilds.fetch(row.guild_id).catch(() => null));
        if (!guild) {
          await updatePortal(row.guild_id, row.user_id, "deny");
          await finishReviewAction({
            id: row.id,
            action: "timeout",
            actorId: "system_timeout",
            status: "quarantined",
          });
          continue;
        }
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          const config = await getGuildConfiguration(row.guild_id);
          if (!config?.setup_done || !config.unverified_role_id || !config.quarantined_role_id) {
            throw new Error("Review timeout quarantine roles are unavailable");
          }
          await updatePortal(row.guild_id, row.user_id, "deny");
          await quarantineMember(member, config, "Manual review timed out", {
            referenceId: row.reference_id,
            caseCode: row.case_code,
            action: "REVIEW_TIMEOUT_QUARANTINED",
          });
          await logReviewAction({
            guildId: row.guild_id,
            userId: row.user_id,
            referenceId: row.reference_id,
            username: member.user.tag,
            action: "VERIFICATION_REVIEW_TIMEOUT",
            reason: "Manual review timed out and the member was quarantined",
          });
        } else {
          await updatePortal(row.guild_id, row.user_id, "deny");
        }
        const finished = await finishReviewAction({
          id: row.id,
          action: "timeout",
          actorId: "system_timeout",
          status: "quarantined",
        });
        if (!finished) throw new Error("Could not finalize review timeout");
        await updateLog(guild, {
          logType: "reviewResolved",
          userId: row.user_id,
          referenceId: row.reference_id,
          caseCode: row.case_code,
          action: "VERIFICATION_REVIEW_TIMEOUT",
          reason: "Manual review timed out and the member was quarantined",
          review: { action: "timeout", actorId: "system_timeout" },
        });
      } catch (error) {
        await releaseReviewAction(row.id, "timeout", error?.message);
        console.error("[CaseSweeper] Review timeout action failed:", error.message);
      }
    }
    return rows;
  }

  async function sweepMemberTimeouts() {
    const reminders = await claimVerificationReminders({ limit: 25 });
    for (const row of reminders) {
      let sent = false;
      try {
        const guild = client.guilds.cache.get(row.guild_id) ||
          (await client.guilds.fetch(row.guild_id).catch(() => null));
        if (!guild) throw new Error("Guild is unavailable for timeout reminder");
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (!member) {
          sent = true;
          continue;
        }
        const timeout = row.summary?.memberTimeout;
        const remainingMinutes = Math.max(
          0,
          Number(timeout?.timeoutMinutes || 0) -
            Number(timeout?.reminderMinutes || 0),
        );
        await member.send(withServerTag(guild, {
          content: `Your verification for **${guild.name}** is still incomplete. You will be kicked in ${remainingMinutes} minutes if you do not finish verification.`,
        }));
        sent = true;
      } catch (error) {
        console.warn("[CaseSweeper] Verification reminder could not be delivered:", error.message);
      } finally {
        await finishVerificationReminder(row.id, sent).catch((error) => {
          console.error("[CaseSweeper] Could not record verification reminder result:", error.message);
        });
      }
    }

    const rows = await claimMemberVerificationTimeouts({ limit: 25 });
    for (const row of rows) {
      try {
        const guild = client.guilds.cache.get(row.guild_id) ||
          (await client.guilds.fetch(row.guild_id).catch(() => null));
        if (!guild) throw new Error("Guild is unavailable for verification timeout");
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          await member.kick("Verification was not completed before the configured timeout");
        }
        const finished = await finishMemberVerificationTimeout(row.id);
        if (!finished) throw new Error("Could not finalize verification timeout");
        if (member) {
          await logReviewAction({
            guildId: row.guild_id,
            userId: row.user_id,
            referenceId: row.reference_id,
            username: member.user.tag,
            action: "VERIFICATION_TIMEOUT_KICK",
            reason: "Member did not complete verification before the configured timeout",
          });
        }
      } catch (error) {
        await releaseMemberVerificationTimeout(row.id, error?.message);
        console.error("[CaseSweeper] Verification timeout action failed:", error.message);
      }
    }
    return { reminders, timeouts: rows };
  }

  async function sweep() {
    if (running || stopped) return [];
    running = true;
    try {
      const checkMenus = menuSweepEnabled && now() - lastMenuCheck >= menuCheckEveryMs;
      if (checkMenus) {
        lastMenuCheck = now();
        await sweepMenus().catch((error) => {
          console.error("[CaseSweeper] Menu expiry sweep failed:", error.message);
        });
      }
      if (reviewSweepEnabled) {
        await sweepReviewTimeouts().catch((error) => {
          console.error("[CaseSweeper] Review timeout sweep failed:", error.message);
        });
      }
      if (memberTimeoutSweepEnabled) {
        await sweepMemberTimeouts().catch((error) => {
          console.error("[CaseSweeper] Member verification timeout sweep failed:", error.message);
        });
      }
      const expired = await claimExpired({ graceSeconds, limit: 50 });
      for (const row of expired) {
        // A link that was never opened never created a Discord log. Mark it
        // expired in storage only; do not send an unsolicited DM.
        if (!row.log_channel_id || !row.log_message_id) continue;

        const guild = client.guilds.cache.get(row.guild_id) ||
          (await client.guilds.fetch(row.guild_id).catch(() => null));
        if (!guild) continue;

        await updateLog(guild, {
          logType: "expired",
          caseCode: row.case_code,
          referenceId: row.reference_id,
          userId: row.user_id,
        }).catch((error) => {
          console.error("[CaseSweeper] Could not update expired case log:", error.message);
        });

        // A completion callback may arrive after expiry was claimed. Never send
        // an expiry DM when the authoritative row has already reached a final state.
        const latest = await caseStore.getByCode(row.guild_id, row.case_code);
        if (!latest || ["verified", "failed", "quarantined"].includes(latest.status)) {
          continue;
        }

        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          await member.send(withServerTag(guild, {
            embeds: [replies.verificationExpired(guild.name)],
          })).catch(() => {});
        }
      }
      return expired;
    } catch (error) {
      console.error("[CaseSweeper] Expiry sweep failed:", error.message);
      return [];
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer || stopped) return timer;
    timer = timerFactory(() => void sweep(), intervalMs);
    timer.unref?.();
    void sweep();
    return timer;
  }

  function stop() {
    stopped = true;
    if (timer) clearTimer(timer);
    timer = null;
  }

  return { start, stop, sweep, sweepMenus, sweepReviewTimeouts, sweepMemberTimeouts };
}

let activeSweeper = null;

function startCaseSweeper(client, options = {}) {
  if (activeSweeper) activeSweeper.stop();
  activeSweeper = createCaseSweeper(client, options);
  activeSweeper.start();
  return activeSweeper;
}

function stopCaseSweeper() {
  activeSweeper?.stop();
  activeSweeper = null;
}

module.exports = { createCaseSweeper, startCaseSweeper, stopCaseSweeper, EXPIRED_ACTION };
