const E = require("../../verification/emojis");
const { EmbedBuilder } = require("discord.js");

module.exports.quarantineEmbed = (member, reason) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setDescription(
      `${E.protected} **Axex security action**\n\n` +
        `<@${member.id}>, your account has been placed in quarantine.\n\n` +
        `${E.invisible} ${E.failed} Result: Verification failed\n` +
        `${E.invisible} ${E.invisible} ${E.warning} **Reason:** \`${String(reason).replaceAll("_", " ")}\`\n` +
        `${E.invisible} ${E.cooldown} Next step: Contact a server moderator\n\n` +
        `${E.arrow} *If this was a mistake, include the reason above when asking for help.*`,
    )
    .setTimestamp();

module.exports.activeCases = (cases) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(`Axex Quarantine — Active Cases (${cases.length})`)
    .setDescription(
      cases.length
        ? cases
            .slice(0, 20)
            .map(
              (item) =>
                `**<@${item.user_id}>** \`${item.username}\`\nCase: \`${item.id}\` • Reason: \`${item.reason}\`\nCreated: <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`,
            )
            .join("\n\n")
        : "No active quarantine cases.",
    )
    .setTimestamp();

module.exports.caseDetails = (item) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(`Axex Quarantine — Case ${item.id}`)
    .addFields(
      {
        name: "Member",
        value: `<@${item.user_id}> \`${item.username}\``,
        inline: true,
      },
      { name: "Reason", value: `\`${item.reason}\``, inline: true },
      {
        name: "Reference",
        value: item.reference_id ? `\`${item.reference_id}\`` : "N/A",
        inline: true,
      },
      {
        name: "Account age",
        value: `${item.account_age ?? "N/A"} days`,
        inline: true,
      },
      {
        name: "Response time",
        value: `${item.click_ms ?? "N/A"} ms`,
        inline: true,
      },
      {
        name: "Created",
        value: `<t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:F>`,
        inline: false,
      },
    )
    .setTimestamp();
