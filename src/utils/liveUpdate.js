const embeds = require('../config/messages');
const { getGuildConfig } = require('../db/client');

async function sendLiveUpdate(guild, data) {
  try {
    const config = await getGuildConfig(guild.id);
    if (!config?.log_channel_id) return false;
    const logChannel = guild.channels.cache.get(config.log_channel_id)
      || await guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (!logChannel?.isTextBased()) return false;
    await logChannel.send({
      embeds: [embeds.logs.liveLog(data)],
      allowedMentions: { parse: [] }
    });
    return true;
  } catch (error) {
    console.error(`Could not send live Axex update for guild ${guild.id}:`, error.message);
    return false;
  }
}

module.exports = { sendLiveUpdate };
