const { PermissionFlagsBits } = require('discord.js');
const { getGuildState, logVerificationEvent, setGuildState } = require('../db/client');
const embeds = require('../config/messages');
const { sendLiveUpdate } = require('../utils/liveUpdate');

async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [embeds.eventMode.guildOnly()], ephemeral: true });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ embeds: [embeds.eventMode.permissionDenied()], ephemeral: true });
    return;
  }

  const action = interaction.options.getString('action', true);
  const hours = interaction.options.getInteger('hours');
  if (action === 'on' && (!Number.isInteger(hours) || hours < 1 || hours > 24)) {
    await interaction.reply({ embeds: [embeds.eventMode.invalidHours()], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const updates = action === 'on'
    ? { eventMode: true, eventModeEnds: new Date(Date.now() + hours * 3_600_000) }
    : { eventMode: false, eventModeEnds: null };
  const state = await setGuildState(interaction.guild.id, updates);
  if (!state) {
    await interaction.editReply({ embeds: [embeds.eventMode.storageFailure()] });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (member) {
    const eventAction = action === 'on' ? 'EVENT MODE ON' : 'EVENT MODE OFF';
    const reason = action === 'on' ? `AUTO_DISABLE_${hours}H` : 'MANUAL_DISABLE';
    await logVerificationEvent({
      guildId: interaction.guild.id,
      userId: member.id,
      username: member.user.tag,
      action: action === 'on' ? 'EVENT_MODE_ON' : 'EVENT_MODE_OFF',
      reason,
      accountAge: null,
      clickMs: null,
      ipFlagged: false,
      raidMode: Boolean(state.raid_mode)
    });
    await sendLiveUpdate(interaction.guild, {
      action: eventAction,
      color: 0xFFD700,
      member,
      reason
    });
  }

  await interaction.editReply({ embeds: [action === 'on' ? embeds.eventMode.enabled(hours) : embeds.eventMode.disabled()] });
}

module.exports = { execute };
