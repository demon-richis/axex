const E = require("../../verification/emojis");
const { EmbedBuilder } = require("discord.js");

function cleanReason(reason) {
  return String(reason ?? "unknown").replaceAll("_", " ");
}

function unix(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

module.exports.quarantineEmbed = (member, reason) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setDescription(
      `${E.quarantine} __**Security Action**__\n` +
        `${E.invisible} ${E.user} <@${member.id}>, your account has been **quarantined.**\n` +
        `${E.invisible} ${E.warning} **Reason:** \`${cleanReason(reason)}\`\n` +
        `${E.invisible} ${E.staff} Contact a server moderator to review it.\n` +
        `-# ${E.invisible} ${E.reminder} Mention the reason above if you think this is a mistake.`,
    )
    .setTimestamp();

module.exports.activeCases = (cases) => {
  const header = `${E.quarantine} __**Active Quarantine Cases — ${cases.length}**__\n`;
  if (!cases.length) {
    return new EmbedBuilder()
      .setColor(0x7f1d1d)
      .setDescription(`${header}${E.invisible} ${E.success} No active quarantine cases.`)
      .setTimestamp();
  }

  const lines = [];
  let used = header.length;
  for (const item of cases.slice(0, 20)) {
    const entry =
      `${E.user} **<@${item.user_id}>** \`${item.username}\`\n` +
      `${E.invisible} ${E.warning} \`${cleanReason(item.reason)}\` · ${E.reminder} <t:${unix(item.created_at)}:R>`;
    if (used + entry.length > 3700) break;
    lines.push(entry);
    used += entry.length + 1;
  }
  const hidden = cases.length - lines.length;
  const footer = hidden > 0 ? `\n-# ${E.invisible} ${E.logs} And ${hidden} more not shown.` : "";

  return new EmbedBuilder()
    .setColor(0x7f1d1d)
    .setDescription(header + lines.join("\n") + footer)
    .setTimestamp();
};

module.exports.caseDetails = (item) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setDescription(
      `${E.quarantine} __**Quarantine Case — ${item.id}**__\n` +
        `${E.invisible} ${E.user} **Member:** <@${item.user_id}> \`${item.username}\`\n` +
        `${E.invisible} ${E.warning} **Reason:** \`${cleanReason(item.reason)}\`\n` +
        `${E.invisible} ${E.idCard} **Reference:** ${item.reference_id ? `\`${item.reference_id}\`` : "N/A"}\n` +
        `${E.invisible} ${E.newAccount} **Account age:** ${item.account_age ?? "N/A"} days\n` +
        `${E.invisible} ${E.timeout} **Response time:** ${item.click_ms ?? "N/A"} ms\n` +
        `-# ${E.invisible} ${E.creation} Created <t:${unix(item.created_at)}:F>`,
    )
    .setTimestamp();