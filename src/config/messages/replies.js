const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

function reply(color, title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${title}\n\n${description}`);

  if (fields.length) embed.addFields(fields);
  return embed;
}

function retryText(attempts, cooldownUntil) {
  if (!cooldownUntil) {
    return `${E.success} Attempt **${attempts}/3** recorded.`;
  }

  return `${E.success} Attempt **${attempts}/3** recorded.\n` +
    `${E.invisible} ${E.timeout} Try again <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>.`;
}

module.exports.success = () => reply(
  0x57F287,
  `${E.verified} **__Verification Complete__**`,
  `${E.invisible} ${E.success} Your verified role has been applied.`,
  [
    {
      name: `${E.user} Access Granted`,
      value: 'Member channels are now unlocked.',
      inline: true
    }
  ],
);

module.exports.verificationFailed = (reason, attempts, cooldownUntil) => reply(
  0xF59E0B,
  `${E.unsuccessful} **__Verification Failed__**`,
  `${E.invisible} ${E.warning} Your answer was not accepted.\n` +
    `${E.invisible} ${E.invisible} ${E.arrow} **Reason:** ${String(reason).replaceAll('_', ' ')}`,
  [
    {
      name: `${E.pending} Next Step`,
      value: retryText(attempts, cooldownUntil),
      inline: false
    }
  ],
);

module.exports.verificationLocked = (attempts, reason) => reply(
  0xEF4444,
  `${E.protected} **__Verification Locked__**`,
  `${E.failed} You have used **${attempts}/3 attempts**.\n` +
    `${E.invisible} ${E.arrow} **Reason:** ${String(reason).replaceAll('_', ' ')}\n\n` +
    `${E.invisible} ${E.invisible} ${E.quarantine} Your account is quarantined. Contact a server moderator for help.`,
);

module.exports.retryCooldown = (attempts, cooldownUntil, reason) => reply(
  0xF59E0B,
  `${E.cooldown} 
  
  
  **__Verification Paused__**`,
  `${E.invisible} ${E.warning} **Reason:** ${String(reason || 'Verification failed').replaceAll('_', ' ')}\n` +
    `${E.invisible} Attempts used: **${attempts}/3**\n\n` +
    `${E.invisible} ${E.invisible} ${E.reminder} Try again <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>.`,
);

module.exports.wrongAnswer = () =>
  module.exports.verificationFailed('Wrong answer', 1, null);

module.exports.tooFast = (ms) => reply(
  0xEF4444,
  `${E.scan} **__Suspicious Response__**`,
  `${E.invisible} ${E.warning} Completed in **${ms}ms**. This attempt has been recorded.`,
);

module.exports.honeypot = () => reply(
  0x7F1D1D,
  `${E.honeypot} **__Security Challenge Failed__**`,
  `${E.invisible} ${E.ban} This session was terminated and your account was quarantined.`,
);

module.exports.timeout = () =>
  module.exports.verificationFailed('Verification timed out', 1, null);

module.exports.noSession = () => reply(
  0x64748B,
  `${E.cooldown} **__Session Expired__**`,
  `${E.invisible} ${E.reminder} This verification session is no longer active.\n` +
    `${E.invisible} ${E.invisible} ${E.link} Request a new verification link.`,
);

module.exports.memberMissing = () => reply(
  0x64748B,
  `${E.user} **__Member Unavailable__**`,
  `${E.invisible} ${E.warning} Your server membership could not be found.\n` +
    `${E.invisible} ${E.invisible} ${E.arrow} Rejoin the server and request a new verification link.`,
);

module.exports.vpnDetected = () => reply(
  0x8B5CF6,
  `${E.vpn} **__VPN or Proxy Detected__**`,
  `${E.invisible} ${E.arrow} Disable your VPN or proxy, then request verification again.`,
);

module.exports.manuallyApproved = () => reply(
  0x57F287,
  `${E.success} **__Verification Approved__**`,
  `${E.invisible} ${E.arrow} A server administrator approved your access.`,
);

module.exports.guildOnly = () => reply(
  0xEF4444,
  `${E.server} **__Server Only__**`,
  `${E.invisible} ${E.arrow} This action can only be used inside a Discord server.`,
);

module.exports.notConfigured = () => reply(
  0xF59E0B,
  `${E.warning} **__Axex Not Configured__**`,
  `${E.invisible} ${E.arrow} Ask a server administrator to complete Axex setup.`,
);

module.exports.alreadyVerified = () => reply(
  0x57F287,
  `${E.verified} **__Already Verified__**`,
  `${E.invisible} ${E.arrow} You already have access to this server.`,
);

module.exports.sessionAlreadyActive = () => reply(
  0xF59E0B,
  `${E.cooldown} **__Verification In Progress__**`,
  `${E.invisible} ${E.arrow} Finish your current verification session before requesting another link.`,
);