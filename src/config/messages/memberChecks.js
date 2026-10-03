const { EmbedBuilder, MessageFlags } = require('discord.js');

function message(color, title, description) {
  return {
    embeds: [new EmbedBuilder().setColor(color).setDescription(`${title}\n\n${description}`)],
    flags: MessageFlags.Ephemeral
  };
}

module.exports.alreadyVerified = () => message(0x00FF88, '<:success:1555947271787682315> **__Already Verified__**', 'You are already verified and have full access to this server!');
module.exports.alreadyQuarantined = () => message(0xFF0000, '<:protected:1555934648490655815> **__Account Quarantined__**', 'Your account is in quarantine. Please contact a server admin to appeal.');
module.exports.sessionActive = () => message(0xFFA500, '<:cooldown:1555947260112670882> **__Verification In Progress__**', 'You already have an active verification session. Please complete it.');
module.exports.ownerSkipped = () => ({
  embeds: [new EmbedBuilder()
    .setColor(0xFFD700)
    .setDescription(
      `<:owner:1555947219914330182> **__Server Owner Detected__**\n\n` +
      ` You are the **Server Owner**.\n` +
      `> You don't need to verify yourself.\n` +
      `> You have full access to this server.`
    )
  ],
  flags: MessageFlags.Ephemeral
});
module.exports.joinPing = (userId) => ({
  content: ` <:captcha:1555934211922198588> <@${userId}> — Click the **Verify** button above to access the server.`
});