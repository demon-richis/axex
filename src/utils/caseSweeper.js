const { caseStore } = require("../db/client");
const { sendLiveUpdate } = require("./liveUpdate");
const { withServerTag } = require("./serverTag");
const replies = require("../config/messages/replies");

const EXPIRED_ACTION = "mark";

function createCaseSweeper(client, options = {}) {
  const claimExpired = options.claimExpired || caseStore.claimExpired.bind(caseStore);
  const updateLog = options.sendLiveUpdate || sendLiveUpdate;
  const intervalMs = Math.max(10_000, Number(options.intervalMs) || 60_000);
  const graceSeconds = Math.max(0, Number(options.graceSeconds ?? 120));
  const timerFactory = options.setInterval || setInterval;
  const clearTimer = options.clearInterval || clearInterval;
  let timer = null;
  let running = false;
  let stopped = false;

  async function sweep() {
    if (running || stopped) return [];
    running = true;
    try {
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

  return { start, stop, sweep };
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
