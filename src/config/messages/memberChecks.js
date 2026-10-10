const E = require('../../verification/emojis');
const { EmbedBuilder, MessageFlags } = require('discord.js');

function message(color, title, description) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setDescription(`${title}\n\n${description}`)
    ],
    flags: MessageFlags.Ephemeral
  };
}

module.exports.alreadyVerified = () => message(
  0x57F287,
  `${E.verified} **__Already Verified__**`,
  `${E.invisible} ${E.success} You already have access to this server.`
);

module.exports.alreadyQuarantined = () => message(
  0x7F1D1D,
  `${E.quarantine} **__Account Quarantined__**`,
  `${E.invisible} ${E.protected} Your account is currently quarantined.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} Contact a server moderator to appeal.`
);

module.exports.sessionActive = () => message(
  0xF59E0B,
  `${E.cooldown} **__Verification In Progress__**`,
  `${E.invisible} ${E.reminder} You already have an active verification session.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} Complete your current session before requesting another.`
);

module.exports.ownerSkipped = () => message(
  0xFFD700,
  `${E.owner} **__Server Owner Detected__**`,
  `${E.invisible} ${E.success} You are the **Server Owner**.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} Verification is not required for your account.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} You already have full server access.`
);

module.exports.joinPing = (userId) => ({
  content: `${E.captcha} <@${userId}> — Click the **Verify** button above to access the server.`
});