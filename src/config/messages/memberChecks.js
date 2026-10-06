const E = require('../../verification/emojis');
const { EmbedBuilder, MessageFlags } = require('discord.js');

function message(color, title, description) {
  return {
    embeds: [new EmbedBuilder().setColor(color).setDescription(`${title}\n\n${description}`)],
    flags: MessageFlags.Ephemeral
  };
}

module.exports.alreadyVerified = () => message(0x00FF88, `${E.success} **__Already Verified__**`, 'You are already verified and have full access to this server!');
module.exports.alreadyQuarantined = () => message(0xFF0000, `${E.protected} **__Account Quarantined__**`, 'Your account is in quarantine. Please contact a server admin to appeal.');
module.exports.sessionActive = () => message(0xFFA500, `${E.cooldown} **__Verification In Progress__**`, 'You already have an active verification session. Please complete it.');
module.exports.ownerSkipped = () => ({
  embeds: [new EmbedBuilder()
    .setColor(0xFFD700)
    .setDescription(
      `${E.owner} **__Server Owner Detected__**\n\n` +
      ` You are the **Server Owner**.\n` +
      `> You don't need to verify yourself.\n` +
      `> You have full access to this server.`
    )
  ],
  flags: MessageFlags.Ephemeral
});
module.exports.joinPing = (userId) => ({
  content: ` ${E.captcha} <@${userId}> — Click the **Verify** button above to access the server.`
});
