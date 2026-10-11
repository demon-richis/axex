const {
  getGuildConfig,
  getGuildState,
  setGuildState,
} = require("../db/client");
const { runPreChecks } = require("../utils/memberChecks");
const messages = require("../config/messages");
const {
  RAID_CLEAR,
  clearIfInactive,
  getRecentJoinCount,
  recordJoin,
} = require("../utils/raidDetector");
const { analyzeUser } = require("../utils/intelligenceClient");
const {
  quarantineUser,
  recordAction,
} = require("../verification/verifySystem");

const raidClearTimers = new Map();

function eventModeExpired(state) {
  if (!state?.event_mode || !state.event_mode_ends) return false;
  const endsAt = new Date(state.event_mode_ends).getTime();
  return Number.isFinite(endsAt) && endsAt <= Date.now();
}

function scheduleRaidClear(guild) {
  const previousTimer = raidClearTimers.get(guild.id);
  if (previousTimer) clearTimeout(previousTimer);
  const timer = setTimeout(async () => {
    raidClearTimers.delete(guild.id);
    if (!clearIfInactive(guild.id)) return;
    const state = await getGuildState(guild.id);
    if (!state.raid_mode) return;
    const updatedState = (await setGuildState(guild.id, {
      raidMode: false,
    })) || { ...state, raid_mode: false };
    const botMember =
      guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (botMember) {
      await recordAction(botMember, updatedState, {
        action: "RAID CLEARED",
        dbAction: "RAID_CLEARED",
        color: 0x00ff88,
        reason: "JOIN_RATE_NORMALIZED",
      });
    }
  }, RAID_CLEAR);
  raidClearTimers.set(guild.id, timer);
}

async function processJoinAfterRole(member, config) {
  const { guild } = member;
  let intelligenceResult = null;
  try {
    const intel = await analyzeUser(member);
    if (intel) {
      console.log(
        `[Axex Intelligence] ${member.user.tag} → Score: ${intel.riskScore} | Level: ${intel.riskLevel} | Action: ${intel.recommendation}`,
      );
    }
    intelligenceResult = intel;
  } catch (error) {
    console.warn(
      `[Axex Intelligence] background analysis failed for ${member.id}:`,
      error.message,
    );
  }

  if (
    intelligenceResult?.recommendation === "block" ||
    intelligenceResult?.riskLevel === "critical"
  ) {
    await quarantineUser(member, config, "INTELLIGENCE_BLOCK", {
      state: await getGuildState(guild.id),
      action: "INTELLIGENCE BLOCKED",
      dbAction: "INTELLIGENCE_BLOCKED",
      color: 0xff0000,
    });
    return;
  }

  if (intelligenceResult?.recommendation === "queue") {
    await quarantineUser(member, config, "INTELLIGENCE_RECOMMENDATION_REVIEW", {
      state: await getGuildState(guild.id),
      action: "INTELLIGENCE REVIEW",
      dbAction: "INTELLIGENCE_REVIEW",
      color: 0xffa500,
    });
    return;
  }

  let state = await getGuildState(guild.id);
  if (eventModeExpired(state)) {
    state = (await setGuildState(guild.id, {
      eventMode: false,
      eventModeEnds: null,
    })) || { ...state, event_mode: false, event_mode_ends: null };
    await recordAction(member, state, {
      action: "EVENT MODE OFF",
      dbAction: "EVENT_MODE_OFF",
      color: 0xffd700,
      reason: "AUTO_EXPIRED",
    });
  }
  const raidThreshold = config.raid_threshold || 10;
  const raidDetected = recordJoin(guild.id, raidThreshold);
  if (raidDetected && !state.raid_mode) {
    state = (await setGuildState(guild.id, { raidMode: true })) || {
      ...state,
      raid_mode: true,
    };
    await recordAction(member, state, {
      action: "RAID DETECTED",
      dbAction: "RAID_DETECTED",
      color: 0xff0000,
      reason: "JOIN_THRESHOLD_EXCEEDED",
      extra: `${getRecentJoinCount(guild.id)} joins in 30 seconds`,
    });
  }
  scheduleRaidClear(guild);
}

async function execute(member) {
  const { guild } = member;
  const check = await runPreChecks(member);
  if (check.skip) {
    if (check.reason === "OWNER") {
      const config = await getGuildConfig(guild.id).catch(() => null);
      if (config?.verified_role_id)
        await member.roles.add(config.verified_role_id).catch(() => {});
    }
    return;
  }
  const config = check.config;

  // Critical path: assign access-control role immediately after Discord emits the join.
  await member.roles.add(config.unverified_role_id).catch((error) => {
    console.error(
      `Could not add Unverified role to ${guild.id}/${member.id}:`,
      error.message,
    );
  });
  const verifyChannel = guild.channels.cache.get(config.verify_channel_id);
  if (verifyChannel) {
    void verifyChannel
      .send(messages.memberChecks.joinPing(member.id))
      .then((ping) => {
        if (ping) setTimeout(() => ping.delete().catch(() => {}), 8_000);
      })
      .catch(() => {});
  }

  // Intelligence, raid detection, and audit writes must never delay role assignment.
  void processJoinAfterRole(member, config).catch((error) => {
    console.error(
      `Background join processing failed for ${guild.id}/${member.id}:`,
      error,
    );
  });
}

module.exports = { execute };
