const { PermissionFlagsBits } = require('discord.js');
const {
  getGuildConfig,
  getGuildState,
  getQueue,
  logVerificationEvent,
  updateQueue
} = require('../db/client');
const embeds = require('../config/messages');
const { sendLiveUpdate } = require('../utils/liveUpdate');

async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [embeds.approvalQueue.guildOnly()], ephemeral: true });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ embeds: [embeds.approvalQueue.permissionDenied()], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const subcommand = interaction.options.getSubcommand();
  const entries = await getQueue(interaction.guild.id);
  if (subcommand === 'list') {
    await interaction.editReply({ embeds: [embeds.approvalQueue.queueList(entries)] });
    return;
  }

  const user = interaction.options.getUser('user', true);
  const entry = entries.find((candidate) => candidate.user_id === user.id);
  if (!entry) {
    await interaction.editReply({ embeds: [embeds.approvalQueue.noPendingUser()] });
    return;
  }
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [embeds.approvalQueue.memberUnavailable()] });
    return;
  }
  const config = await getGuildConfig(interaction.guild.id);
  if (!config?.setup_done) {
    await interaction.editReply({ embeds: [embeds.approvalQueue.actionFailed()] });
    return;
  }

  let roleUpdated = true;
  if (subcommand === 'approve') {
    roleUpdated = await member.roles.remove(config.quarantined_role_id)
      .then(() => member.roles.add(config.verified_role_id))
      .then(() => true)
      .catch(() => false);
  }
  const queueUpdated = roleUpdated && await updateQueue(entry.id, subcommand === 'approve' ? 'approved' : 'rejected', interaction.user.id);
  if (!queueUpdated) {
    await interaction.editReply({ embeds: [embeds.approvalQueue.actionFailed()] });
    return;
  }

  const state = await getGuildState(interaction.guild.id);
  const action = subcommand === 'approve' ? 'APPROVED' : 'REJECTED';
  await logVerificationEvent({
    guildId: interaction.guild.id,
    userId: member.id,
    username: member.user.tag,
    action,
    reason: entry.reason,
    clickMs: entry.click_ms,
    accountAge: entry.account_age,
    ipFlagged: false,
    raidMode: Boolean(state.raid_mode)
  });
  await sendLiveUpdate(interaction.guild, {
    action,
    color: subcommand === 'approve' ? 0x00FF88 : 0xFF0000,
    member,
    accountAge: entry.account_age,
    clickMs: entry.click_ms,
    reason: entry.reason,
    extra: `Handled by <@${interaction.user.id}>`
  });
  await interaction.editReply({
    embeds: [subcommand === 'approve'
      ? embeds.approvalQueue.approved(member, interaction.user)
      : embeds.approvalQueue.rejected(member, interaction.user)]
  });
}

module.exports = { execute };
