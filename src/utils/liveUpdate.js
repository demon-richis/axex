const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../db/client');
const E = require('../verification/emojis');

const cases = new Map();
const queues = new Map();

const FINAL_LOG_TYPES = new Set([
  'verified',
  'wrongAnswer',
  'timedOut',
  'botDetected',
  'vpnDetected',
  'locked',
]);

function isFinal(data) {
  const action = String(data?.action || '').toUpperCase();
  return FINAL_LOG_TYPES.has(data?.logType)
    || action.includes('VERIFIED')
    || action.includes('QUARANTIN')
    || action.includes('BLOCKED')
    || action.includes('FAILED');
}

function isSupported(data) {
  return data?.logType === 'intelligenceAnalysis'
    || data?.logType === 'serviceError'
    || data?.logType === 'roleUpdateFailed'
    || isFinal(data);
}

function caseKey(guild, data) {
  return `${guild.id}:${data?.member?.id || data?.userId || 'unknown'}`;
}

function safe(value, fallback = 'N/A', limit = 180) {
  return String(value ?? fallback)
    .replaceAll('`', "'")
    .replaceAll('\n', ' ')
    .slice(0, limit);
}

function resultLabel(data) {
  const action = String(data?.action || '').toUpperCase();
  if (data?.logType === 'verified' || action === 'VERIFIED') return 'VERIFIED';
  if (data?.logType === 'vpnDetected' || data?.logType === 'locked' || action.includes('QUARANTIN') || action.includes('BLOCKED')) return 'QUARANTINED';
  if (isFinal(data)) return 'FAILED';
  return 'IN PROGRESS';
}

function buildCaseEmbed(state) {
  const final = state.final;
  const result = resultLabel(final || state.latest);
  const passed = result === 'VERIFIED';
  const quarantined = result === 'QUARANTINED';
  const statusEmoji = passed ? E.success : quarantined ? E.quarantine : state.errors.length ? E.warning : E.loading;
  const color = passed ? 0x57f287 : quarantined ? 0xff0000 : state.errors.length ? 0xff0000 : 0x5865f2;
  const member = state.member;
  const lines = [
    `${statusEmoji} __**VERIFICATION CASE**__`,
    '',
    `> ${E.user} **User:** ${member ? `<@${member.id}> \`${safe(member.user?.tag)}\`` : 'Unknown'}`,
    `> ${E.idCard} **User ID:** \`${safe(member?.id)}\``,
    `> ${E.logs} **Case ID:** \`${safe(state.referenceId)}\``,
    `> ${E.webhook} **Status:** \`${result}\``,
  ];

  if (state.accountAge !== undefined || state.clickMs !== undefined || final?.attempts !== undefined) {
    lines.push('', `${E.scan} __**Verification details**__`);
    if (state.accountAge !== undefined) lines.push(`> ${E.newAccount} **Account age:** \`${safe(state.accountAge, 'N/A')} days\``);
    if (state.clickMs !== undefined && state.clickMs !== null) lines.push(`> ${E.loading} **Response time:** \`${safe(state.clickMs)} ms\``);
    if (final?.attempts !== undefined) lines.push(`> ${E.timeout} **Attempt:** \`${safe(final.attempts)}\``);
    if (final?.reason) lines.push(`> ${E.warning} **Reason:** \`${safe(final.reason)}\``);
  }

  if (state.intelligence) {
    const intelligence = state.intelligence;
    lines.push('', `${E.idCard} __**Account intelligence**__`);
    lines.push(`> ${E.vpn} **Risk:** \`${safe(intelligence.riskLevel, 'unknown').toUpperCase()}\` • \`${safe(intelligence.riskScore)} / 100\``);
    lines.push(`> ${E.protected} **Recommendation:** \`${safe(intelligence.recommendation, 'unknown').toUpperCase()}\``);
    lines.push(`> ${E.scan} **Confidence:** \`${safe(intelligence.confidence, 'unknown').toUpperCase()}\``);
    if (intelligence.reasons?.length) lines.push(`> ${E.warning} **Signals:** \`${safe(intelligence.reasons.join(', '))}\``);
  }

  if (state.errors.length) {
    lines.push('', `${E.warning} __**Errors**__`);
    for (const error of state.errors.slice(-3)) {
      lines.push(`> ${E.role} **${safe(error.stage, 'system')}:** \`${safe(error.message)}\``);
    }
  }

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(lines.join('\n'))
    .setFooter({ text: state.eventId ? `Event: ${safe(state.eventId, 'N/A', 80)}` : 'Axex verification audit' })
    .setTimestamp();
}

async function fetchLogChannel(guild) {
  const config = await getGuildConfig(guild.id);
  if (!config?.log_channel_id) return null;
  return guild.channels.cache.get(config.log_channel_id)
    || await guild.channels.fetch(config.log_channel_id).catch(() => null);
}

async function updateCase(guild, data) {
  if (!isSupported(data)) return;
  const key = caseKey(guild, data);
  const previous = cases.get(key) || {
    member: data.member,
    referenceId: data.referenceId,
    eventId: data.eventId,
    accountAge: data.accountAge,
    clickMs: data.clickMs,
    latest: data,
    final: null,
    intelligence: null,
    errors: [],
    message: null,
  };

  previous.member = data.member || previous.member;
  previous.referenceId = data.referenceId || previous.referenceId;
  previous.eventId = data.eventId || previous.eventId;
  previous.accountAge = data.accountAge ?? previous.accountAge;
  previous.clickMs = data.clickMs ?? previous.clickMs;
  previous.latest = data;

  if (data.logType === 'intelligenceAnalysis') previous.intelligence = data.result || null;
  if (data.logType === 'serviceError' || data.logType === 'roleUpdateFailed') {
    previous.errors.push({ stage: data.stage || data.roleName || 'system', message: data.error || 'Unknown error' });
  }
  if (isFinal(data)) previous.final = data;
  cases.set(key, previous);

  const channel = await fetchLogChannel(guild);
  if (!channel?.isTextBased()) return;

  const payload = { embeds: [buildCaseEmbed(previous)], allowedMentions: { parse: [] } };
  if (previous.message) {
    await previous.message.edit(payload).catch(() => {
      previous.message = null;
    });
  }
  if (!previous.message) {
    previous.message = await channel.send(payload).catch((error) => {
      console.error(`[LiveUpdate] Could not send verification case for guild ${guild.id}:`, error.message);
      return null;
    });
  }
}

async function sendLiveUpdate(guild, data = {}) {
  if (!guild || !isSupported(data)) return null;
  const key = caseKey(guild, data);
  const previous = queues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => updateCase(guild, data));
  queues.set(key, next);
  await next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return cases.get(key)?.message || null;
}

module.exports = { sendLiveUpdate };
