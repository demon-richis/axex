const { EmbedBuilder } = require('discord.js');

function base(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports.queueList = (entries) => {
  const description = entries.length === 0
    ? '✅ No pending users in the queue.'
    : entries.map((entry, index) =>
      `**${index + 1}.** <@${entry.user_id}> \`${entry.username}\`\nReason: \`${entry.reason}\` • Age: ${entry.account_age}d • <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:R>`
    ).join('\n\n');
  return base(0x5865F2,
    `<:pending:1551656840817938472> **__Quarantine Queue — ${entries.length} pending__**\n\n` +
    description
  );
};

module.exports.approved = (member, admin) =>
  base(0x00FF88,
    `<:success:1550511021146247239> **__User Approved__**\n\n` +
    `<@${member.id}> was approved by <@${admin.id}>.`
  );

module.exports.rejected = (member, admin) =>
  base(0xFF0000,
    `<:unsuccessful:1550510059262451733> **__User Rejected__**\n\n` +
    `<@${member.id}> was rejected by <@${admin.id}>.`
  );

module.exports.noPendingUser = () =>
  base(0xFFA500,
    `<:suspicious:1550515702006554774> **__User Not In Queue__**\n\n` +
    `That user does not have a pending quarantine approval entry.`
  );

module.exports.memberUnavailable = () =>
  base(0xFF0000,
    `<:error:1551980017800712295> **__Member Unavailable__**\n\n` +
    `That user is no longer a member of this server.`
  );

module.exports.permissionDenied = () =>
  base(0xFF0000,
    `<:protected:1550516426530488443> **__Permission Required__**\n\n` +
    `You need the Manage Server permission to manage the approval queue.`
  );

module.exports.guildOnly = () =>
  base(0xFF0000,
    `<:error:1551980017800712295> **__Server Only__**\n\n` +
    `The approval queue is available only inside a server.`
  );

module.exports.actionFailed = () =>
  base(0xFF0000,
    `<:unsuccessful:1550510059262451733> **__Queue Action Failed__**\n\n` +
    `Axex could not update the member roles or queue record. Please check bot permissions and try again.`
  );
