const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  getGuildConfig,
  getQuarantineCase,
  getQuarantineCases,
  logVerificationEvent,
  resolveQuarantineCase,
} = require("../db/client");
const messages = require("../config/messages");

async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: messages.system.quarantineServerOnly(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: messages.system.manageServerRequired(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "list") {
    const cases = await getQuarantineCases(interaction.guild.id);
    await interaction.reply({
      embeds: [messages.quarantine.activeCases(cases)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = interaction.options.getUser("user", true);
  const item = await getQuarantineCase(interaction.guild.id, user.id);
  if (!item) {
    await interaction.reply({
      content: messages.system.noActiveQuarantineCase(user.id),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "inspect") {
    await interaction.reply({
      embeds: [messages.quarantine.caseDetails(item)],
      flags: MessageFlags.Ephemeral,
    });
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
        content: messages.system.quarantineUnavailable(),
      });
      return;
    }
    try {
      const websiteUrl = process.env.WEBSITE_URL;
      const websiteApiKey = process.env.WEBSITE_API_KEY;
      if (!websiteUrl || !websiteApiKey) {
        throw new Error("Verification portal release is not configured");
      }
      const releaseResponse = await fetch(
        `${websiteUrl.replace(/\/$/, "")}/api/bot/release`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": websiteApiKey,
          },
          body: JSON.stringify({
            guildId: interaction.guild.id,
            userId: member.id,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!releaseResponse.ok) {
        throw new Error(`Verification portal release failed (${releaseResponse.status})`);
      }
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
        content: messages.system.quarantineReleased(member.id),
      });
    } catch (error) {
      await interaction.editReply({
        content: messages.system.quarantineReleaseFailed(error),
      });
    }
  }
}

module.exports = { execute };
