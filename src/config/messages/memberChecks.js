const { EmbedBuilder } = require('discord.js');

function message(color, title, description) {
  return {
    embeds: [new EmbedBuilder().setColor(color).setDescription(`${title}\n\n${description}`)],
    ephemeral: true
  };
}

module.exports.alreadyVerified = () => message(0x00FF88, '<:verified:1550465125440430191> **__Already Verified__**', 'You are already verified and have full access to this server!');
module.exports.alreadyQuarantined = () => message(0xFF0000, '<:protected:1550516426530488443> **__Account Quarantined__**', 'Your account is in quarantine. Please contact a server admin to appeal.');
module.exports.sessionActive = () => message(0xFFA500, '<:pending:1551656840817938472> **__Verification In Progress__**', 'You already have an active verification session. Please complete it.');
module.exports.ownerSkipped = () => ({
  embeds: [new EmbedBuilder()
    .setColor(0xFFD700)
    .setDescription(
      `<:owner:1552026264276177018> **__Server Owner Detected__**\n\n` +
      `<:owner:1552026264276177018> You are the **Server Owner**.\n` +
      `> You don't need to verify yourself.\n` +
      `> You have full access to this server.`
    )
  ],
  ephemeral: true
});
module.exports.joinPing = (userId) => ({
  content: `👋 <@${userId}> — Click the **Verify** button above to access the server.`
});