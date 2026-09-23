const { EmbedBuilder } = require('discord.js');

module.exports.quarantineEmbed = (member, reason) => {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setDescription(`<:unsuccessful:1550510059262451733> **__Verification Failed__**\n\n<@${member.id}>, you have been placed in quarantine.\nReason: \`${reason}\`\n-# Contact a server admin to appeal.`);
};
