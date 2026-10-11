const E = require("../../verification/emojis");
const { EmbedBuilder } = require("discord.js");

module.exports.quarantineEmbed = (member, reason) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setDescription(
      `${E.quarantine} **__Security Action__**\n\n` +
        `<@${member.id}>, your account has been placed in quarantine.\n\n` +
        `${E.invisible} ${E.failed} Result: Verification failed\n` +
        `${E.invisible} ${E.invisible} ${E.warning} **Reason:** \`${String(reason).replaceAll("_", " ")}\`\n` +
        `${E.invisible} ${E.cooldown} Next step: Contact a server moderator\n\n` +
        `${E.arrow} *If this was a mistake, include the reason above when asking for help.*`,
    )
    .setTimestamp();

module.exports.activeCases = (cases) =>
  new EmbedBuilder()
    .setColor(0x7f1d1d)
    .setDescription(
      `${E.quarantine} **__Active Quarantine Cases — ${cases.length}__**\n\n` +
      (cases.length
        ? cases
            .slice(0, 20)
            .map(
              (item) =>
                `${E.invisible} **__<@${item.user_id}> \`${item.username}\`__**\n` +
                `${E.invisible} ${E.arrow} **Reason:** \`${String(item.reason).replaceAll("_", " ")}\`\n` +
                `${E.invisible} ${E.reminder} <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`,
            )
            .join("\n\n")
        : `${E.invisible} ${E.success} No active quarantine cases.`,
      ),
    )
    .setTimestamp();

module.exports.caseDetails = (item) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setDescription(`${E.quarantine} **__Quarantine Case — ${item.id}__**`)
    .addFields(
      {
        name: `${E.user} Member`,
        value: `<@${item.user_id}> \`${item.username}\``,
        inline: true,
      },
      { name: `${E.warning} Reason`, value: `\`${item.reason}\``, inline: true },
      {
        name: `${E.idCard} Reference`,
        value: item.reference_id ? `\`${item.reference_id}\`` : "N/A",
        inline: true,
      },
      {
        name: `${E.newAccount} Account Age`,
        value: `${item.account_age ?? "N/A"} days`,
        inline: true,
      },
      {
        name: `${E.timeout} Response Time`,
        value: `${item.click_ms ?? "N/A"} ms`,
        inline: true,
      },
      {
        name: `${E.creation} Created`,
        value: `<t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:F>`,
        inline: false,
      },
    )
    .setTimestamp();
