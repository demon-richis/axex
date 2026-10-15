const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../db/client");
const { handleVerifyStart } = require("../verification/verifySystem");
const { handleSetupButton, handleRoleSelect } = require("../commands/vsetup");
const embeds = require("../config/messages");

async function execute(interaction) {
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("axex_setup_roles_")
  ) {
    await handleRoleSelect(interaction);
    return;
  }

  if (!interaction.isButton() || !interaction.customId.startsWith("axex_"))
    return;

  if (interaction.customId.startsWith("axex_setup_")) {
    await handleSetupButton(interaction);
    return;
  }

  if (interaction.customId === "axex_help") {
    await interaction.reply({
      content: embeds.system.help(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === "axex_verify_start") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [embeds.replies.guildOnly()] });
      return;
    }

    const ownerId = interaction.guild.ownerId;
    const userId = interaction.user?.id;
    if (typeof ownerId === "string" && ownerId && userId === ownerId) {
      await interaction.editReply(embeds.memberChecks.ownerSkipped());
      return;
    }

    let member = interaction.member;
    if (
      !member?.user ||
      member.user.id !== userId ||
      member.guild?.id !== interaction.guild.id ||
      typeof member.roles?.cache?.has !== "function"
    ) {
      try {
        member = await interaction.guild.members.fetch(userId);
      } catch {
        member = null;
      }
    }
    if (
      !member?.user ||
      member.user.id !== userId ||
      member.guild?.id !== interaction.guild.id ||
      typeof member.roles?.cache?.has !== "function"
    ) {
      await interaction.editReply({
        embeds: [embeds.system.verificationLinkError()],
      });
      return;
    }

    const config = await getGuildConfig(interaction.guild.id);
    if (!config?.setup_done) {
      await interaction.editReply({ embeds: [embeds.replies.notConfigured()] });
      return;
    }

    await interaction.editReply({
      content: embeds.system.preparingVerification(),
    });
    await handleVerifyStart(interaction, config, { member });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      embeds: [embeds.replies.guildOnly()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = await getGuildConfig(interaction.guild.id);
  if (!config?.setup_done) {
    await interaction.reply({
      embeds: [embeds.replies.notConfigured()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

module.exports = { execute };
