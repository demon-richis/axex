const E = require('../../verification/emojis');
const { EmbedBuilder } = require('discord.js');

function base(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports.enabled = (hours) =>
  base(0xFFD700,
    `${E.success} **__Event Mode Enabled__**\n\n` +
    `Account age check disabled. Auto-disables in **${hours} hour(s)**.\n` +
    `Timing check and honeypot remain active.`
  );

module.exports.disabled = () =>
  base(0xFFD700,
    `${E.captcha} **__Event Mode Disabled__**\n\n` +
    `Normal verification restored. All checks are active.`
  );

module.exports.invalidHours = () =>
  base(0xFF0000,
    `${E.warning} **__Event Mode Not Changed__**\n\n` +
    `Choose a duration from 1 to 24 hours when enabling event mode.`
  );

module.exports.permissionDenied = () =>
  base(0xFF0000,
    `${E.protected} **__Permission Required__**\n\n` +
    `You need the Manage Server permission to use this command.`
  );

module.exports.guildOnly = () =>
  base(0xFF0000,
    `${E.warning} **__Server Only__**\n\n` +
    `Event mode can only be changed inside a server.`
  );

module.exports.storageFailure = () =>
  base(0xFF0000,
    `${E.failed} **__Event Mode Not Changed__**\n\n` +
    `Axex could not save the event mode state. Please try again.`
  );
