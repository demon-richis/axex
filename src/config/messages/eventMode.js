const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

function base(color, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description);
}

module.exports.enabled = (hours) => base(
  0x57F287,
  `${E.creation} __**Event Mode Enabled**__\n` +
  `${E.invisible} ${E.success} Account age check has been **disabled.**\n` +
  `${E.invisible} ${E.antiRaid} Timing check and honeypot stay **active.**\n` +
  `-# ${E.invisible} ${E.timeout} Turns off automatically in ${hours} hour(s).`
);

module.exports.disabled = () => base(
  0x64748B,
  `${E.creation} __**Event Mode Disabled**__\n` +
  `${E.invisible} ${E.success} Normal verification has been **restored.**\n` +
  `-# ${E.invisible} ${E.protected} All verification checks are active.`
);

module.exports.invalidHours = () => base(
  0xF59E0B,
  `${E.warning} __**Invalid Duration**__\n` +
  `${E.invisible} ${E.timeout} Choose a duration between **1 and 24 hours**.\n` +
  `-# ${E.invisible} ${E.arrow} A duration is required when enabling event mode.`
);

module.exports.permissionDenied = () => base(
  0xEF4444,
  `${E.protected} __**Permission Required**__\n` +
  `${E.invisible} ${E.staff} Event mode needs the **Manage Server** permission.\n` +
  `-# ${E.invisible} ${E.reminder} Ask a server administrator for access.`
);

module.exports.guildOnly = () => base(
  0xEF4444,
  `${E.server} __**Server Only**__\n` +
  `${E.invisible} ${E.creation} Event mode can only be changed inside a *server*.`
);

module.exports.storageFailure = () => base(
  0xEF4444,
  `${E.failed} __**Event Mode Not Changed**__\n` +
  `${E.invisible} ${E.warning} Axex couldn't save the event mode state.\n` +
  `-# ${E.invisible} ${E.reminder} Nothing was changed. Please try again.`
);