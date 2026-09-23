const { EmbedBuilder } = require('discord.js');

module.exports.liveLog = ({ action, color = 0x888888, member, accountAge, clickMs, reason, extra }) => {
  const userValue = member ? `<@${member.id}> \`${member.user.tag}\`` : 'System';
  const idValue = member?.id || 'N/A';
  const ageValue = Number.isInteger(accountAge) ? `${accountAge} days` : 'N/A';
  const clickValue = Number.isInteger(clickMs) ? `${clickMs}ms` : 'N/A';
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(
      `<:loading:1551655097770184774> **__Axex Live — ${action}__**\n\n` +
      `<:user:1550520335919481002> ${userValue}\n` +
      `ID: \`${idValue}\` • Age: \`${ageValue}\` • Click: \`${clickValue}\`\n` +
      `Reason: \`${reason || 'N/A'}\`` +
      (extra ? `\nExtra: ${extra}` : '')
    );
};

module.exports.raidDetected = (joinCount) =>
  new EmbedBuilder()
    .setColor(0xFF0000)
    .setDescription(`<:protected:1550516426530488443> **__RAID DETECTED__**\n\n${joinCount} joins in 30 seconds. Hard mode activated.`);

module.exports.raidCleared = () =>
  new EmbedBuilder()
    .setColor(0x00FF88)
    .setDescription('<:success:1550511021146247239> **__RAID MODE CLEARED__**\n\nJoin rate normalized. Verification returned to normal mode.');
