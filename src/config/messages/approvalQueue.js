const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

function base(color, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description);
}

module.exports.queueList = (entries) => {
  const description = entries.length === 0
    ? `${E.invisible} ${E.success} No pending users in the queue.`
    : entries.map((entry, index) =>
        `**${index + 1}.** <@${entry.user_id}> \`${entry.username}\`\n` +
        `${E.invisible} ${E.arrow} **Reason:** \`${String(entry.reason).replaceAll('_', ' ')}\`\n` +
        `${E.invisible} ${E.newAccount} **Account Age:** ${entry.account_age}d\n` +
        `${E.invisible} ${E.reminder} <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:R>`
      ).join('\n\n');

  return base(
    0xF59E0B,
    `${E.quarantine} **__Quarantine Queue — ${entries.length} pending__**\n\n` +
    description
  );
};

module.exports.approved = (member, admin) => base(
  0x57F287,
  `${E.success} **__User Approved__**\n\n` +
  `${E.invisible} ${E.success} <@${member.id}> has been approved.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} **Approved by:** <@${admin.id}>`
);

module.exports.rejected = (member, admin) => base(
  0xEF4444,
  `${E.failed} **__User Rejected__**\n\n` +
  `${E.invisible} ${E.failed} <@${member.id}> has been rejected.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} **Rejected by:** <@${admin.id}>`
);

module.exports.noPendingUser = () => base(
  0xF59E0B,
  `${E.scan} **__User Not In Queue__**\n\n` +
  `${E.invisible} ${E.warning} That user does not have a pending quarantine approval entry.`
);

module.exports.memberUnavailable = () => base(
  0x64748B,
  `${E.user} **__Member Unavailable__**\n\n` +
  `${E.invisible} ${E.warning} That user is no longer a member of this server.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} Refresh the queue and try again.`
);

module.exports.permissionDenied = () => base(
  0xEF4444,
  `${E.protected} **__Permission Required__**\n\n` +
  `${E.invisible} ${E.warning} You need the **Manage Server** permission to manage the approval queue.`
);

module.exports.guildOnly = () => base(
  0xEF4444,
  `${E.server} **__Server Only__**\n\n` +
  `${E.invisible} ${E.arrow} This action can only be used inside a Discord server.`
);

module.exports.actionFailed = () => base(
  0xEF4444,
  `${E.failed} **__Queue Action Failed__**\n\n` +
  `${E.invisible} ${E.warning} Axex could not update the member roles or queue record.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} Check bot permissions and try again.`
);