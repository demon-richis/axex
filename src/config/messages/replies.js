const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

function reply(color, title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${title}\n${description}`);

  if (fields.length) embed.addFields(fields);
  return embed;
}

function retryText(attempts, cooldownUntil) {
  if (!cooldownUntil) {
    return `${E.success} Attempt **${attempts}/3** recorded.`;
  }

  return `${E.success} Attempt **${attempts}/3** recorded.\n` +
    `${E.timeout} Try again <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>.`;
}

module.exports.success = () => reply(
  0x57F287,
  `${E.success} __**Verification Complete**__`,
  `${E.invisible} ${E.role} Your **Verified** role has been applied.\n` +
    `-# ${E.invisible}  ${E.server} You now have access to the *server*.`,
);


module.exports.verificationFailed = (reason, attempts, cooldownUntil) => reply(
  0xF59E0B,
  `${E.unsuccessful} **__Verification Failed__**`,
  `${E.invisible} ${E.warning} Your answer was not **accepted.**\n` +
    `${E.invisible} ${E.logs}  **Reason:** ${String(reason).replaceAll('_', ' ')}\n` +
    `-# ${E.invisible} ${E.timeout} **Attempt:** ${attempts}/3` +
    (cooldownUntil
      ? ` · Retry <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>`
      : ''),
);

module.exports.verificationLocked = (attempts, reason) => reply(
  0xEF4444,
  `${E.protected} __**Verification Locked**__`,
  `${E.invisible} ${E.quarantine} Your account has been **quarantined.**\n` +
    `${E.invisible} ${E.logs}  **Reason:** ${String(reason).replaceAll('_', ' ')}\n` +
    `-# ${E.invisible} ${E.help} **Attempts:** ${attempts}/3 · Contact a server moderator`,
);
module.exports.retryCooldown = (attempts, cooldownUntil, reason) => reply(
  0xF59E0B,
  `${E.quarantine} **__Verification Paused__**`,
  `${E.invisible} ${E.logs} **Reason:** ${String(reason || 'Verification failed').replaceAll('_', ' ')}\n` +
    `${E.invisible} ${E.timeout} Try again <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>\n` +
    `-# ${E.invisible} ${E.warning} **Attempts used:** ${attempts}/3`,
);

module.exports.wrongAnswer = () =>
  module.exports.verificationFailed('Wrong answer', 1, null);

module.exports.tooFast = (ms) => reply(
  0xEF4444,
  `${E.warning} __**Suspicious Response**__`,
  `${E.invisible} ${E.arrow} That was **too fast** to be human.\n` +
    `${E.invisible} ${E.timeout} Completed in **${ms}ms**\n` +
    `-# ${E.invisible} ${E.logs} This attempt has been recorded.`,
);

module.exports.honeypot = () => reply(
  0x7F1D1D,
  `${E.honeypot} __**Security Challenge Failed**__`,
  `${E.invisible} ${E.ban} This session has been **terminated.**\n` +
    `${E.invisible} ${E.quarantine} Your account has been **quarantined.**\n` +
    `-# ${E.invisible} ${E.logs} This action has been recorded.`,
);

module.exports.timeout = () =>
  module.exports.verificationFailed('Verification timed out', 1, null);

module.exports.noSession = () => reply(
  0x64748B,
  `${E.timeout} __**Session Expired**__`,
  `${E.invisible} ${E.reminder} This verification session is no longer active.\n` +
    `${E.invisible} ${E.link} Request a new verification link to continue.`,
);

module.exports.memberMissing = () => reply(
  0x64748B,
  `${E.failed} __**Member Unavailable**__`,
  `${E.invisible} ${E.user} Your server membership could not be found.\n` +
    `${E.invisible} ${E.arrow} Rejoin the server, then request a new verification link.`,
);
module.exports.vpnDetected = () => reply(
  0x8B5CF6,
  `${E.vpn} __**VPN or Proxy Detected**__`,
  `${E.invisible} ${E.warning} Verification can't continue on a VPN or proxy.\n` +
    `${E.invisible} ${E.reminder} Turn it off, then request a new verification link.\n` +
    `-# ${E.invisible} ${E.logs} This attempt has been recorded.`,
);

module.exports.manuallyApproved = () => reply(
  0x57F287,
  `${E.success} __**Verification Approved**__`,
  `${E.invisible} ${E.staff} A server administrator approved your access.\n` +
    `${E.invisible} ${E.role} Your **Verified** role has been applied.\n` +
    `-# ${E.invisible} ${E.server} You now have access to the *server*.`,
);

module.exports.guildOnly = () => reply(
  0xEF4444,
  `${E.server} __**Server Only**__`,
  `${E.invisible} ${E.warning} This action isn't available in direct messages.\n` +
    `${E.invisible} ${E.reminder} Use it inside a Discord server instead.`,
);

module.exports.notConfigured = () => reply(
  0xF59E0B,
  `${E.pending} __**Axex Not Configured**__`,
  `${E.invisible} ${E.warning} Axex hasn't been set up on this server yet.\n` +
    `${E.invisible} ${E.reminder} Ask a server administrator to complete the setup.`,
);

module.exports.alreadyVerified = () => reply(
  0x57F287,
  `${E.verified} __**Already Verified**__`,
  `${E.invisible} ${E.success} You're already verified on this server.\n` +
    `${E.invisible} ${E.server} No further action is needed.`,
);

module.exports.sessionAlreadyActive = () => reply(
  0xF59E0B,
  `${E.cooldown} __**Verification In Progress...**__`,
  `${E.invisible} ${E.reminder} You already have an active verification session.\n` +
    `${E.invisible} ${E.link} Finish it before requesting another link.`,
);

module.exports.attemptsExhausted = (attempts, reason) => reply(
  0x7F1D1D,
  `${E.protected} __**Attempts Exhausted**__`,
  `${E.invisible} ${E.failed} You have used all **${attempts}/3** attempts.\n` +
    `${E.invisible} ${E.logs}  **Reason:** ${String(reason).replaceAll('_', ' ')}\n` +
    `-# ${E.invisible} ${E.quarantine} Account quarantined · Contact a server moderator`,
);
