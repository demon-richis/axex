const embeds = require('../config/messages');
const { getGuildConfig } = require('../db/client');

function verificationEmbed(data) {
  const logs = embeds.logs;
  switch (data.logType) {
    case 'verificationStarted': return logs.verificationStarted(data.member);
    case 'linkCreated': return logs.linkCreated(data.member, data.expiresAt);
    case 'cooldown': return logs.cooldown(data.member, data.attempts, data.cooldownUntil, data.reason);
    case 'locked': return logs.locked(data.member, data.attempts, data.reason);
    case 'callbackReceived': return logs.callbackReceived(data.member, data.passed, data.reason);
    case 'roleUpdateFailed': return logs.roleUpdateFailed(data.member, data.roleName, data.error);
    case 'serviceError': return logs.serviceError(data.member, data.stage, data.error);
    case 'verified': return logs.verified(data.member, data.clickMs);
    case 'wrongAnswer': return logs.wrongAnswer(data.member, data.clickMs);
    case 'timedOut': return logs.timedOut(data.member);
    case 'botDetected': return logs.botDetected(data.member, data.clickMs);
    case 'vpnDetected': return logs.vpnDetected(data.member, data.ip);
    default: return logs.liveLog(data);
  }
}

async function sendLiveUpdate(guild, data) {
  try {
    const config = await getGuildConfig(guild.id);
    if (!config?.log_channel_id) return false;
    const logChannel = guild.channels.cache.get(config.log_channel_id)
      || await guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (!logChannel?.isTextBased()) return false;
    await logChannel.send({
      embeds: [verificationEmbed(data)],
      allowedMentions: { parse: [] }
    });
    return true;
  } catch (error) {
    console.error(`Could not send live Axex update for guild ${guild.id}:`, error.message);
    return false;
  }
}

module.exports = { sendLiveUpdate };
