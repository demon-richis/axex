const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getVerificationTimeline } = require('../db/client');

function safe(value, fallback = 'N/A') {
  return String(value ?? fallback).replaceAll('`', "'").replaceAll('\n', ' ').slice(0, 900);
}

async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need Manage Server permission to view verification timelines.', flags: MessageFlags.Ephemeral });
    return;
  }

  const referenceId = String(interaction.options.getString('reference') || '').trim().toUpperCase();
  if (!/^AX-[A-Z0-9]{8}$/.test(referenceId)) {
    await interaction.reply({ content: 'Use a valid case ID such as `AX-1A2B3C4D`.', flags: MessageFlags.Ephemeral });
    return;
  }

  const events = await getVerificationTimeline(interaction.guildId, referenceId);
  if (!events.length) {
    await interaction.reply({
      content: `No verification history was found for case \`${referenceId}\` in this server.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const first = events[0];
  const timeline = events.slice(-12).map((event) => {
    const timestamp = event.created_at ? `<t:${Math.floor(new Date(event.created_at).getTime() / 1000)}:f>` : 'Unknown time';
    const reason = event.reason ? ` — ${safe(event.reason, '')}` : '';
    return `**${safe(event.action)}** ${timestamp}\n\`${safe(event.event_id)}\`${reason}`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x676669)
    .setTitle(`Verification Case ${referenceId}`)
    .setDescription(timeline)
    .addFields(
      { name: 'Member', value: `<@${safe(first.user_id)}> \`${safe(first.username)}\``, inline: true },
      { name: 'Events', value: String(events.length), inline: true },
      { name: 'Tracking', value: 'Use this case ID with moderators and support.', inline: false },
    )
    .setFooter({ text: events.length > 12 ? 'Showing the 12 most recent events' : 'Axex audit timeline' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { execute };
