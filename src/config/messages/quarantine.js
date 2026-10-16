const E = require("../../verification/emojis");
const { EmbedBuilder } = require("discord.js");

module.exports.quarantineEmbed = (member, reason) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setDescription(
      `${E.quarantine} **__Security Action__**\n` +
        `<@${member.id}>, your account has been placed in quarantine.\n` +
        `${E.failed} Result: Verification failed\n` +
        `${E.warning} **Reason:** \`${String(reason).replaceAll("_", " ")}\`\n` +
        `${E.cooldown} Next step: Contact a server moderator\n` +
        `${E.arrow} *If this was a mistake, include the reason above when asking for help.*`,
    )
    .setTimestamp();

module.exports.activeCases = (cases) =>
  new EmbedBuilder()
    .setColor(0x7f1d1d)
    .setDescription(
      `${E.quarantine} **__Active Quarantine Cases — ${cases.length}__**\n` +
      (cases.length
        ? cases
            .slice(0, 20)
            .map(
              (item) =>
                `**__<@${item.user_id}> \`${item.username}\`__**\n` +
                `${E.arrow} **Reason:** \`${String(item.reason).replaceAll("_", " ")}\`\n` +
                `${E.reminder} <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`,
            )
            .join("\n")
        : `${E.success} No active quarantine cases.`
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
