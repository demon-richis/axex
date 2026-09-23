const {
  getGuildConfig,
  getGuildState,
  setGuildState
} = require('../db/client');
const { runPreChecks } = require('../utils/memberChecks');
const messages = require('../config/messages');
const { checkIP } = require('../utils/ipCheck');
const {
  RAID_CLEAR,
  clearIfInactive,
  getRecentJoinCount,
  recordJoin
} = require('../utils/raidDetector');
const { quarantineUser, recordAction } = require('../verification/verifySystem');

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
    const updatedState = await setGuildState(guild.id, { raidMode: false }) || { ...state, raid_mode: false };
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (botMember) {
      await recordAction(botMember, updatedState, {
        action: 'RAID CLEARED',
        dbAction: 'RAID_CLEARED',
        color: 0x00FF88,
        reason: 'JOIN_RATE_NORMALIZED'
      });
    }
  }, RAID_CLEAR);
  raidClearTimers.set(guild.id, timer);
}

async function execute(member) {
  const { guild } = member;
  const check = await runPreChecks(member);
  if (check.skip) {
    if (check.reason === 'OWNER') {
      const config = await getGuildConfig(guild.id).catch(() => null);
      if (config?.verified_role_id) await member.roles.add(config.verified_role_id).catch(() => {});
    }
    return;
  }
  const config = check.config;

  let state = await getGuildState(guild.id);
  if (eventModeExpired(state)) {
    state = await setGuildState(guild.id, { eventMode: false, eventModeEnds: null })
      || { ...state, event_mode: false, event_mode_ends: null };
    await recordAction(member, state, {
      action: 'EVENT MODE OFF',
      dbAction: 'EVENT_MODE_OFF',
      color: 0xFFD700,
      reason: 'AUTO_EXPIRED'
    });
  }

  const raidThreshold = config.raid_threshold || 10;
  const raidDetected = recordJoin(guild.id, raidThreshold);
  if (raidDetected && !state.raid_mode) {
    state = await setGuildState(guild.id, { raidMode: true }) || { ...state, raid_mode: true };
    await recordAction(member, state, {
      action: 'RAID DETECTED',
      dbAction: 'RAID_DETECTED',
      color: 0xFF0000,
      reason: 'JOIN_THRESHOLD_EXCEEDED',
      extra: `${getRecentJoinCount(guild.id)} joins in 30 seconds`
    });
  }
  scheduleRaidClear(guild);

  await member.roles.add(config.unverified_role_id).catch((error) => {
    console.error(`Could not add Unverified role to ${guild.id}/${member.id}:`, error.message);
  });

  const verifyChannel = guild.channels.cache.get(config.verify_channel_id);
  if (verifyChannel) {
    const ping = await verifyChannel.send(messages.memberChecks.joinPing(member.id)).catch(() => null);
    if (ping) setTimeout(() => ping.delete().catch(() => {}), 8_000);
  }

  await recordAction(member, state, {
    action: 'MEMBER JOINED',
    dbAction: 'MEMBER_JOINED',
    color: 0x5865F2,
    reason: 'VERIFICATION_STARTED'
  });

  // Discord does not expose a joining member's IP. This call intentionally
  // receives null today and is ready for a future OAuth/IP collection flow.
  const ipResult = await checkIP(null);
  if (ipResult.isVPN) {
    await quarantineUser(member, config, 'VPN_PROXY_DETECTED', {
      state,
      action: 'VPN BLOCKED',
      dbAction: 'VPN_BLOCKED',
      color: 0x9B59B6,
      ipFlagged: true
    });
    return;
  }

}

module.exports = { execute };
