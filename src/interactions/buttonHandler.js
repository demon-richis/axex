const { MessageFlags } = require('discord.js');
const { getGuildConfig } = require('../db/client');
const { handleVerification, handleVerifyStart } = require('../verification/verifySystem');
const { handleSetupButton } = require('../commands/vsetup');
const embeds = require('../config/messages');

async function execute(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('axex_')) return;

  if (interaction.customId.startsWith('axex_setup_')) {
    await handleSetupButton(interaction);
    return;
  }

  if (interaction.customId === 'axex_verify_start') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [embeds.replies.guildOnly()] });
      return;
    }

    const config = await getGuildConfig(interaction.guild.id);
    if (!config?.setup_done) {
      await interaction.editReply({ embeds: [embeds.replies.notConfigured()] });
      return;
    }

    await handleVerifyStart(interaction, config);
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ embeds: [embeds.replies.guildOnly()], ephemeral: true });
    return;
  }

  const config = await getGuildConfig(interaction.guild.id);
  if (!config?.setup_done) {
    await interaction.reply({ embeds: [embeds.replies.notConfigured()], ephemeral: true });
    return;
  }

  if (interaction.customId.startsWith('axex_') && !interaction.customId.startsWith('axex_setup_')) {
    await handleVerification(interaction, config);
  }
}

module.exports = { execute };
