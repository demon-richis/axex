const E = require('../../verification/emojis');
const { EmbedBuilder, MessageFlags } = require('discord.js');

function message(color, title, description) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setDescription(`${title}\n${description}`)
    ],
    flags: MessageFlags.Ephemeral
  };
}

module.exports.alreadyVerified = () => message(
  0x57F287,
  `${E.verified} __**Already Verified**__`,
  `${E.invisible} ${E.role} Your **Verified** role is already active.\n` +
  `-# ${E.invisible} ${E.server} No further action is needed.`
);

module.exports.alreadyQuarantined = () => message(
  0x7F1D1D,
  `${E.quarantine} __**Account Quarantined**__`,
  `${E.invisible} ${E.protected} Your account is currently **quarantined.**\n` +
  `${E.invisible} ${E.staff} A server moderator can review your case.\n` +
  `-# ${E.invisible} ${E.reminder} Contact a moderator to appeal.`
);

module.exports.sessionActive = () => message(
  0xF59E0B,
  `${E.cooldown} __**Already In Progress**__`,
  `${E.invisible} ${E.verify} A verification session is already running for you.\n` +
  `${E.invisible} ${E.arrow} Use the link you already received.\n` +
  `-# ${E.invisible} ${E.timeout} Links expire after 10 minutes.`
);

module.exports.ownerSkipped = () => message(
  0xFFD700,
  `${E.owner} __**Server Owner Detected**__`,
  `${E.invisible} ${E.success} You're the **Server Owner**, so verification is skipped.\n` +
  `-# ${E.invisible} ${E.server} You already have full access to the *server*.`
);

module.exports.joinPing = (userId) => ({
  content:
    `${E.captcha} Welcome <@${userId}>!\n` +
    `${E.invisible} ${E.arrow} Press **Verify** above to access the server.`
});