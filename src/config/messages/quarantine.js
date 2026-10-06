const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

module.exports.quarantineEmbed = (member, reason) => new EmbedBuilder()
  .setColor(0xEF4444)
  .setDescription(
    `${E.protected} **Axex security action**\n\n` +
    `<@${member.id}>, your account has been placed in quarantine.\n\n` +
    `> ${E.failed} **Result:** Verification failed\n` +
    `> ${E.warning} **Reason:** \`${String(reason).replaceAll('_', ' ')}\`\n` +
    `> ${E.cooldown} **Next step:** Contact a server moderator\n\n` +
    `-# If this was a mistake, include the reason above when asking for help.`,
  )
  .setTimestamp();
