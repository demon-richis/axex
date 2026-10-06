const { EmbedBuilder } = require('discord.js');
const E = require('../../verification/emojis');

function safe(value, fallback = 'N/A', limit = 300) {
  return String(value ?? fallback).replaceAll('`', "'").replaceAll('\n', ' ').slice(0, limit);
}

function memberLines(member) {
  const id = member?.id || 'N/A';
  const tag = member?.user?.tag;
  return [
    `> ${E.user} **User:** ${member ? `<@${id}>${tag ? ` \`${safe(tag)}\`` : ''}` : 'System'}`,
    `> ${E.id} **ID:** \`${safe(id)}\``,
  ];
}

function baseEmbed(emoji, title, member, fields, color) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(`${emoji} __**${title}**__\n\n${[...memberLines(member), ...fields].join('\n')}`)
    .setTimestamp();
}

function resultLabel(data) {
  const action = String(data?.action || data?.outcome || '').toUpperCase();
  if (action.includes('VERIF') && action.includes('FAIL')) return 'FAILED';
  if (action.includes('QUARANT') || action.includes('LOCK') || action.includes('VPN')) return 'QUARANTINED';
  if (action.includes('VERIFIED') || action === 'PASSED') return 'PASSED';
  return safe(data?.outcome || data?.action, 'COMPLETED', 80).toUpperCase();
}

module.exports.verificationResult = (data) => {
  const result = resultLabel(data);
  const passed = result === 'PASSED';
  const quarantined = result === 'QUARANTINED';
  const emoji = passed ? E.success : quarantined ? E.quarantine : E.failed;
  const color = passed ? 0x57f287 : quarantined ? 0xff0000 : 0xffa500;
  return baseEmbed(emoji, 'MEMBER VERIFICATION RESULT', data.member, [
    `> ${E.verify} **Result:** \`${result}\``,
    `> ${E.warning} **Reason:** \`${safe(data.reason, 'No additional reason')}\``,
    `> ${E.timeout} **Attempt:** \`${safe(data.attempts, 'N/A')}\``,
    `> ${E.loading} **Response time:** \`${safe(data.clickMs, 'N/A')}\``,
  ], color);
};

module.exports.intelligenceAnalysis = (member, result, source) => baseEmbed(
  result?.recommendation === 'block' || result?.riskLevel === 'critical' ? E.warning : E.scan,
  'ACCOUNT INTELLIGENCE RESPONSE',
  member,
  [
    `> ${E.idCard} **Risk score:** \`${Number.isFinite(result?.riskScore) ? `${result.riskScore}/100` : 'N/A'}\``,
    `> ${E.warning} **Risk level:** \`${safe(result?.riskLevel, 'unknown').toUpperCase()}\``,
    `> ${E.protected} **Recommendation:** \`${safe(result?.recommendation, 'unknown').toUpperCase()}\``,
    `> ${E.scan} **Confidence:** \`${safe(result?.confidence, 'unknown').toUpperCase()}\``,
    `> ${E.server} **Source:** \`${safe(source, 'verification portal', 120)}\``,
    `> ${E.warning} **Signals:** \`${safe(Array.isArray(result?.reasons) && result.reasons.length ? result.reasons.slice(0, 5).join(', ') : 'No elevated signals')}\``,
  ],
  result?.recommendation === 'block' || result?.riskLevel === 'critical' ? 0xff0000 : 0x5865f2,
);

module.exports.serviceError = (member, stage, error) => baseEmbed(E.warning, 'VERIFICATION ERROR', member, [
  `> ${E.role} **Stage:** \`${safe(stage, 'unknown', 100)}\``,
  `> ${E.warning} **Error:** \`${safe(error, 'Unknown error')}\``,
], 0xff0000);

module.exports.roleUpdateFailed = (member, roleName, error) => baseEmbed(E.role, 'ROLE UPDATE ERROR', member, [
  `> ${E.role} **Role:** \`${safe(roleName, 'verification role', 100)}\``,
  `> ${E.warning} **Error:** \`${safe(error, 'Unknown error')}\``,
], 0xff0000);
