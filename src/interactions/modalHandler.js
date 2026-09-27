const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, saveMemberRoleIds } = require('../db/client');
const embeds = require('../config/messages');
const {
  beginPendingSetup,
  runSetup,
  inspectResources,
  consumePendingModalTimeout
} = require('../commands/vsetup');

function parseRoleIds(value) {
  return [...new Set(value.split(',').flatMap((part) => {
    const match = part.trim().match(/^(?:<@&(\d{17,19})>|(\d{17,19}))$/);
    return match ? [match[1] || match[2]] : [];
  }))];
}

async function execute(interaction) {
  if (!interaction.isModalSubmit() || interaction.customId !== 'axex_setup_roles_modal') return false;
  if (!interaction.guild) {
    await interaction.reply({ embeds: [embeds.setup.guildOnly()], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ embeds: [embeds.setup.permissionDenied()], flags: MessageFlags.Ephemeral });
    return true;
  }

  const memberRoleIds = parseRoleIds(interaction.fields.getTextInputValue('role_ids_input'));
  if (memberRoleIds.length === 0) {
    await interaction.reply({ embeds: [embeds.setup.invalidRoleIds()], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!await saveMemberRoleIds(interaction.guild.id, memberRoleIds)) {
    await interaction.reply({ embeds: [embeds.setup.saveRolesFailed()], flags: MessageFlags.Ephemeral });
    return true;
  }

  const timeoutSeconds = consumePendingModalTimeout(interaction.guild.id, interaction.user.id);
  const config = await getGuildConfig(interaction.guild.id);
  if (!config?.setup_done) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await runSetup(interaction, 'use-existing', memberRoleIds, timeoutSeconds);
    return true;
  }

  const token = beginPendingSetup(interaction.guild.id, interaction.user.id, 'strategy', memberRoleIds, timeoutSeconds);
  const resources = inspectResources(interaction.guild);
  await interaction.reply({
    embeds: [embeds.setup.existingResources(resources)],
    ...embeds.setup.resourceButtons(token, 'strategy'),
    flags: MessageFlags.Ephemeral
  });
  return true;
}

module.exports = { execute };