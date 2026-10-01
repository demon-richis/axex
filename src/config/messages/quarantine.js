const { EmbedBuilder } = require('discord.js');

module.exports.quarantineEmbed = (member, reason) => new EmbedBuilder()
  .setColor(0xEF4444)
  .setDescription(
    `<:protected:1550516426530488443> **Axex security action**\n\n` +
    `<@${member.id}>, your account has been placed in quarantine.\n\n` +
    `> <:unsuccessful:1550510059262451733> **Result:** Verification failed\n` +
    `> <:error:1551980017802295> **Reason:** \`${String(reason).replaceAll('_', ' ')}\`\n` +
    `> <:pending:1551656840817938472> **Next step:** Contact a server moderator\n\n` +
    `-# If this was a mistake, include the reason above when asking for help.`,
  )
  .setTimestamp();
