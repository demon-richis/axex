const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getGuildConfig,
  getQuarantineCase,
  getQuarantineCases,
  logVerificationEvent,
  resolveQuarantineCase,
} = require("../db/client");

function base(title, color = 0xef4444) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`Axex Quarantine — ${title}`)
    .setTimestamp();
}

function formatCase(item) {
  return (
    `**<@${item.user_id}>** \`${item.username}\`\n` +
    `Case: \`${item.id}\` • Reason: \`${item.reason}\`\n` +
    `Created: <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`
  );
}

async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need Manage Server permission to manage quarantine cases.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "list") {
    const cases = await getQuarantineCases(interaction.guild.id);
    const embed = base(`Active Cases (${cases.length})`).setDescription(
      cases.length
        ? cases.slice(0, 20).map(formatCase).join("\n\n")
        : "No active quarantine cases.",
    );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const user = interaction.options.getUser("user", true);
  const item = await getQuarantineCase(interaction.guild.id, user.id);
  if (!item) {
    await interaction.reply({
      content: `No active quarantine case was found for <@${user.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "inspect") {
    const embed = base(`Case ${item.id}`).addFields(
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
    );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "release") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);
    const config = await getGuildConfig(interaction.guild.id);
    if (!member || !config?.setup_done) {
      await interaction.editReply({
        content: "The member or Axex configuration is unavailable.",
      });
      return;
    }
    try {
      await member.roles.remove(config.quarantined_role_id);
      await member.roles.add(config.unverified_role_id);
      await resolveQuarantineCase(
        item.id,
        interaction.user.id,
        "released",
        "Released by administrator",
      );
      await logVerificationEvent({
        referenceId: item.reference_id,
        guildId: interaction.guild.id,
        userId: member.id,
        username: member.user.tag,
        action: "QUARANTINE_RELEASED",
        reason: `Released by ${interaction.user.tag}`,
        accountAge: item.account_age,
      });
      await interaction.editReply({
        content: `Released <@${member.id}> from quarantine. The member must complete verification again.`,
      });
    } catch (error) {
      await interaction.editReply({
        content: `Could not release the member: ${error.message}`,
      });
    }
  }
}

module.exports = { execute };
