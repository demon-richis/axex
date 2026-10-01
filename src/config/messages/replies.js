const { EmbedBuilder } = require('discord.js');

const E = {
  success: '<:success:155051102114627239>',
  verified: '<:verified:1550465125440430191>',
  unsuccessful: '<:unsuccessful:1550510059262451733>',
  protected: '<:protected:1550516426530488443>',
  pending: '<:pending:1551656840817938472>',
  error: '<:error:1551980017802295>',
  verify: '<:verify:1551154167727398993>',
  ban: '<:ban:1550513842990088233>',
};

function reply(color, title, description, fields = []) {
  const embed = new EmbedBuilder().setColor(color).setDescription(`${title}\n\n${description}`).setTimestamp();
  if (fields.length) embed.addFields(fields);
  return embed;
}

function retryText(attempts, cooldownUntil) {
  if (!cooldownUntil) return `Attempt **${attempts} of 3** recorded.`;
  return `Attempt **${attempts} of 3** recorded.\nYou may try again <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>.`;
}

module.exports.success = () => reply(
  0x57F287,
  `${E.verified} **Verification complete**`,
  'Your verified role has been applied. Welcome to the server.',
  [{ name: `${E.success} Access`, value: 'You can now view the member channels.', inline: true }],
);

module.exports.verificationFailed = (reason, attempts, cooldownUntil) => reply(
  0xF59E0B,
  `${E.unsuccessful} **Verification failed**`,
  `Your answer was not accepted.\n\n**Reason:** ${String(reason).replaceAll('_', ' ')}`,
  [{ name: `${E.pending} Next step`, value: retryText(attempts, cooldownUntil), inline: false }],
);

module.exports.verificationLocked = (attempts, reason) => reply(
  0xEF4444,
  `${E.protected} **Verification locked**`,
  `You have used all **${attempts} of 3** attempts.\n\n**Reason:** ${String(reason).replaceAll('_', ' ')}\n\nYour account is in quarantine. Contact a server moderator if you need help.`,
);

module.exports.retryCooldown = (attempts, cooldownUntil, reason) => reply(
  0xF59E0B,
  `${E.pending} **Verification temporarily paused**`,
  `**Reason:** ${String(reason || 'Verification failed').replaceAll('_', ' ')}\n\nYou have used **${attempts} of 3** attempts. Try again <t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>.`,
);

module.exports.wrongAnswer = () => module.exports.verificationFailed('Wrong answer', 1, null);
module.exports.tooFast = (ms) => reply(0xEF4444, `${E.protected} **Suspicious response**`, `Response completed in **${ms}ms**. Your attempt has been recorded.`);
module.exports.honeypot = () => reply(0x7F1D1D, `${E.ban} **Security challenge failed**`, 'This verification session was terminated and your account was quarantined.');
module.exports.timeout = () => module.exports.verificationFailed('Verification timed out', 1, null);
module.exports.noSession = () => reply(0x64748B, `${E.pending} **Session expired**`, 'This verification session is no longer active. Please request a new verification link.');
module.exports.memberMissing = () => reply(0x64748B, `${E.error} **Member unavailable**`, 'Your server membership could not be found. Rejoin the server and request a new link.');
module.exports.vpnDetected = () => reply(0x8B5CF6, `${E.protected} **VPN or proxy detected**`, 'Disable your VPN or proxy, then request verification again.');
module.exports.manuallyApproved = () => reply(0x57F287, `${E.success} **Verification approved**`, 'A server administrator approved your access.');
module.exports.guildOnly = () => reply(0xEF4444, `${E.error} **Server only**`, 'This action can only be used inside a Discord server.');
module.exports.notConfigured = () => reply(0xF59E0B, `${E.error} **Axex is not configured**`, 'Ask a server administrator to complete Axex setup.');
module.exports.alreadyVerified = () => reply(0x57F287, `${E.verified} **Already verified**`, 'You already have access to this server.');
module.exports.sessionAlreadyActive = () => reply(0xF59E0B, `${E.pending} **Verification already in progress**`, 'Finish your existing verification session before requesting another link.');
