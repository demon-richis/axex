const { EmbedBuilder } = require('discord.js');

module.exports.quarantineEmbed = (member, reason) => new EmbedBuilder()
  .setColor(0xEF4444)
  .setDescription(
    `<:protected:1555934648490655815> **Axex security action**\n\n` +
    `<@${member.id}>, your account has been placed in quarantine.\n\n` +
    `> <:failed:1555947263304671384> **Result:** Verification failed\n` +
    `> <:warning:1555947291259568238> **Reason:** \`${String(reason).replaceAll('_', ' ')}\`\n` +
    `> <:cooldown:1555947260112670882> **Next step:** Contact a server moderator\n\n` +
    `-# If this was a mistake, include the reason above when asking for help.`,
  )
  .setTimestamp();
