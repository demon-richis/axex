const { EmbedBuilder } = require('discord.js');

const E = {
  memberjoined: '<:user:1555947253468762234>',
  creation: '<:creation:1555947235227992124>',
  bot: '<:bot:1555947216622059753>',
  id: '<:user:1555947253468762234>',
  user: '<:user:1555947253468762234>',
  verify: '<:captcha:1555934211922198588>',
  verified: '<:success:1555947271787682315>',
  unverified: '<:quarantine:1555947272091729950>',
  suspicious: '<:scan:1555934607369834526>',
  ban: '<:quarantine:1555947272091729950>',
  success: '<:success:1555947271787682315>',
  unsuccessful: '<:failed:1555947263304671384>',
  protected: '<:protected:1555934648490655815>',
  error: '<:warning:1555947291259568238>',
  pending: '<:cooldown:1555947260112670882>',
  loading: '<:loading:1555947250604056716>',
  owner: '<:owner:1555947219914330182>',
};

function age(createdAt) {
  const days = Math.floor((Date.now() - createdAt) / 86_400_000);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

function memberLines(member) {
  const user = member?.user;
  const id = member?.id || 'N/A';
  const tag = user?.tag;
  return [
    `> ${E.user} **User:** ${member ? `<@${id}>${tag ? ` \`${tag}\`` : ''}` : 'System'}`,
    `> ${E.id} **Id:** \`${id}\``,
  ];
}

function memberAge(member) {
  const createdAt = member?.user?.createdAt;
  return createdAt ? age(createdAt) : 'N/A';
}

function eventLog(emoji, title, member, fields) {
  return new EmbedBuilder()
    .setDescription(`${emoji} __**${title}**__\n\n${[...memberLines(member), ...fields].join('\n')}`)
    .setTimestamp();
}

function reasonText(reason) {
  return String(reason || 'N/A').replaceAll('_', ' ');
}

function codeText(value) {
  return String(value ?? 'N/A').replaceAll('`', "'").replaceAll('\n', ' ').slice(0, 300);
}

module.exports.liveLog = ({ action, member, accountAge, clickMs, reason, extra }) => {
  const userValue = member ? `<@${member.id}> \`${member.user.tag}\`` : 'System';
  const idValue = member?.id || 'N/A';
  const ageValue = Number.isInteger(accountAge) ? `${accountAge} days` : 'N/A';
  const clickValue = Number.isInteger(clickMs) ? `${clickMs}ms` : 'N/A';
  return new EmbedBuilder()
    .setDescription(
      `${E.loading} __**Axex Live — ${action}**__\n\n` +
      `> ${E.user} **User:** ${userValue}\n` +
      `> ${E.id} **Id:** \`${idValue}\`\n` +
      `> ${E.creation} **Age:** \`${ageValue}\`\n` +
      `> ${E.verify} **Click:** \`${clickValue}\`\n` +
      `> ${E.pending} **Reason:** \`${reason || 'N/A'}\`` +
      (extra ? `\n> ${extra}` : '')
    )
    .setTimestamp();
};

module.exports.verificationStarted = (member) => eventLog(E.verify, 'VERIFICATION STARTED', member, [
  `> ${E.creation} **Age:** \`${memberAge(member)}\``,
  `> ${E.pending} **Status:** Verification link requested`,
]);

module.exports.linkCreated = (member, expiresAt) => eventLog(E.verify, 'VERIFICATION LINK CREATED', member, [
  `> ${E.pending} **Expires:** \`${expiresAt ? new Date(expiresAt).toISOString() : '10 minutes'}\``,
  `> ${E.protected} **Status:** Link sent to user`,
]);

module.exports.cooldown = (member, attempts, cooldownUntil, reason) => eventLog(E.pending, 'VERIFICATION COOLDOWN', member, [
  `> ${E.unsuccessful} **Reason:** \`${reasonText(reason)}\``,
  `> ${E.verify} **Attempt:** \`${attempts}/3\``,
  `> ${E.pending} **Retry:** ${cooldownUntil ? `<t:${Math.floor(new Date(cooldownUntil).getTime() / 1000)}:R>` : 'N/A'}`,
]);

module.exports.locked = (member, attempts, reason) => eventLog(E.protected, 'VERIFICATION LOCKED', member, [
  `> ${E.unsuccessful} **Reason:** \`${reasonText(reason)}\``,
  `> ${E.verify} **Attempts:** \`${attempts}/3\``,
  `> ${E.error} **Verdict:** Quarantined after maximum attempts`,
]);

module.exports.callbackReceived = (member, passed, reason) => eventLog(passed ? E.success : E.unsuccessful, 'VERIFICATION CALLBACK RECEIVED', member, [
  `> ${E.verify} **Result:** \`${passed ? 'PASSED' : 'FAILED'}\``,
  `> ${E.pending} **Reason:** \`${reasonText(reason)}\``,
]);

module.exports.roleUpdateFailed = (member, roleName, error) => eventLog(E.error, 'ROLE UPDATE FAILED', member, [
  `> ${E.verify} **Role:** \`${roleName || 'verification role'}\``,
  `> ${E.error} **Error:** \`${String(error || 'Unknown error').slice(0, 300)}\``,
  `> ${E.pending} **Action:** Manual moderator review required`,
]);

module.exports.serviceError = (member, stage, error) => eventLog(E.error, 'VERIFICATION SERVICE ERROR', member, [
  `> ${E.verify} **Stage:** \`${stage || 'unknown'}\``,
  `> ${E.error} **Error:** \`${String(error || 'Unknown error').slice(0, 300)}\``,
]);

module.exports.raidDetected = (joinCount) => new EmbedBuilder().setDescription(`${E.protected} __**RAID DETECTED**__\n\n> ⚡ **Joins:** ${joinCount} in 30 seconds\n> ${E.error} **Action:** Hard lockdown activated`).setTimestamp();
module.exports.raidCleared = () => new EmbedBuilder().setDescription(`${E.success} __**RAID MODE CLEARED**__\n\n> ${E.verified} **Status:** Join rate normalized\n> ${E.loading} **Mode:** Verification returned to normal`).setTimestamp();
module.exports.memberJoined = (member) => eventLog(E.memberjoined, 'MEMBER JOINED', member, [...(member?.user?.bot ? [`> ${E.bot} **Bot:** Yes`] : []), `> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.verify} **Status:** Verification started`]);
module.exports.verified = (member, clickMs) => eventLog(E.verified, 'MEMBER VERIFIED', member, [`> ${E.bot} **Bot:** No`, `> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.verify} **Click Speed:** \`${clickMs}ms\``, `> ${E.success} **Verdict:** Passed`]);
module.exports.wrongAnswer = (member, clickMs) => eventLog(E.unsuccessful, 'WRONG ANSWER', member, [...(member?.user?.bot ? [`> ${E.bot} **Bot:** Yes`] : []), `> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.verify} **Click Speed:** \`${clickMs}ms\``, `> ${E.unsuccessful} **Verdict:** Wrong answer recorded`]);
module.exports.timedOut = (member) => eventLog(E.pending, 'VERIFICATION TIMED OUT', member, [`> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.pending} **Verdict:** Did not verify in 60s`]);
module.exports.botDetected = (member, clickMs) => eventLog(E.bot, 'BOT DETECTED', member, [`> ${E.bot} **Bot:** Likely`, `> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.verify} **Click Speed:** \`<1500ms (${clickMs}ms)\``, `> ${E.error} **Verdict:** Auto quarantined`]);
module.exports.suspicious = (member, clickMs) => eventLog(E.suspicious, 'SUSPICIOUS ACTIVITY', member, [`> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.verify} **Click Speed:** \`borderline (${clickMs}ms)\``, `> ${E.suspicious} **Verdict:** Flagged`]);
module.exports.newAccount = (member) => eventLog(E.error, 'NEW ACCOUNT', member, [`> ${E.creation} **Age:** \`<7 days (${memberAge(member)})\``, `> ${E.pending} **Verdict:** Monitoring`]);
module.exports.honeypot = (member) => eventLog(E.ban, 'HONEYPOT TRIGGERED', member, [`> ${E.bot} **Bot:** Confirmed`, `> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.error} **Trigger:** Hidden button`, `> ${E.ban} **Verdict:** Banned`]);
module.exports.vpnDetected = (member, ip) => eventLog(E.error, 'VPN/PROXY DETECTED', member, [`> ${E.creation} **Age:** \`${memberAge(member)}\``, `> ${E.id} **IP:** \`${ip || 'N/A'}\``, `> ${E.error} **Verdict:** VPN/Proxy detected — quarantined`]);
module.exports.intelligenceAnalysis = (member, result, source) => eventLog(
  result?.recommendation === 'block' || result?.riskLevel === 'critical' ? E.suspicious : E.loading,
  'INTELLIGENCE ANALYSIS',
  member,
  [
    `> ${E.id} **Risk score:** \`${Number.isFinite(result?.riskScore) ? `${result.riskScore}/100` : 'N/A'}\``,
    `> ${E.suspicious} **Risk level:** \`${codeText(result?.riskLevel || 'unknown').toUpperCase()}\``,
    `> ${E.protected} **Recommendation:** \`${codeText(result?.recommendation || 'unknown').toUpperCase()}\``,
    `> ${E.pending} **Confidence:** \`${codeText(result?.confidence || 'unknown').toUpperCase()}\``,
    `> ${E.verify} **Source:** \`${codeText(source || 'verification portal')}\``,
    `> ${E.error} **Reasons:** \`${codeText((Array.isArray(result?.reasons) && result.reasons.length ? result.reasons : ['No elevated signals']).slice(0, 5).join(', '))}\``,
  ],
);
