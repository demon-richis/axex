const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

function base(color, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description);
}

module.exports.enabled = (hours) => base(
  0x57F287,
  `${E.creation} **__Event Mode Enabled__**\n\n` +
  `${E.invisible} ${E.success} Account age check has been disabled.\n` +
  `${E.invisible} ${E.reminder} **Auto-disable:** In ${hours} hour(s).\n\n` +
  `${E.invisible} ${E.arrow} Timing check and honeypot remain active.`
);

module.exports.disabled = () => base(
  0x64748B,
  `${E.creation} **__Event Mode Disabled__**\n\n` +
  `${E.invisible} ${E.success} Normal verification has been restored.\n` +
  `${E.invisible} ${E.arrow} All verification checks are active.`
);

module.exports.invalidHours = () => base(
  0xF59E0B,
  `${E.warning} **__Invalid Event Duration__**\n\n` +
  `${E.invisible} ${E.arrow} Choose a duration between **1 and 24 hours** when enabling event mode.`
);

module.exports.permissionDenied = () => base(
  0xEF4444,
  `${E.protected} **__Permission Required__**\n\n` +
  `${E.invisible} ${E.warning} You need the **Manage Server** permission to use this command.`
);

module.exports.guildOnly = () => base(
  0xEF4444,
  `${E.server} **__Server Only__**\n\n` +
  `${E.invisible} ${E.arrow} Event mode can only be changed inside a Discord server.`
);

module.exports.storageFailure = () => base(
  0xEF4444,
  `${E.failed} **__Event Mode Not Changed__**\n\n` +
  `${E.invisible} ${E.warning} Axex could not save the event mode state.\n` +
  `${E.invisible} ${E.invisible} ${E.arrow} Please try again.`
);