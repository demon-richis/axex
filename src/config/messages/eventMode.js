const { EmbedBuilder } = require('discord.js');

function base(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports.enabled = (hours) =>
  base(0xFFD700,
    `<:success:1555947271787682315> **__Event Mode Enabled__**\n\n` +
    `Account age check disabled. Auto-disables in **${hours} hour(s)**.\n` +
    `Timing check and honeypot remain active.`
  );

module.exports.disabled = () =>
  base(0xFFD700,
    `<:captcha:1555934211922198588> **__Event Mode Disabled__**\n\n` +
    `Normal verification restored. All checks are active.`
  );

module.exports.invalidHours = () =>
  base(0xFF0000,
    `<:warning:1555947291259568238> **__Event Mode Not Changed__**\n\n` +
    `Choose a duration from 1 to 24 hours when enabling event mode.`
  );

module.exports.permissionDenied = () =>
  base(0xFF0000,
    `<:protected:1555934648490655815> **__Permission Required__**\n\n` +
    `You need the Manage Server permission to use this command.`
  );

module.exports.guildOnly = () =>
  base(0xFF0000,
    `<:warning:1555947291259568238> **__Server Only__**\n\n` +
    `Event mode can only be changed inside a server.`
  );

module.exports.storageFailure = () =>
  base(0xFF0000,
    `<:failed:1555947263304671384> **__Event Mode Not Changed__**\n\n` +
    `Axex could not save the event mode state. Please try again.`
  );
