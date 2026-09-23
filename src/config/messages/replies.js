const { EmbedBuilder } = require('discord.js');

function reply(color, title, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(`${title}\n\n${description}`);
}

module.exports.success = () => reply(0x00FF88, '<:success:1550511021146247239> **__Verified!__**', 'You have been verified. Welcome to the server!');
module.exports.wrongAnswer = () => reply(0xFF6600, '<:unsuccessful:1550510059262451733> **__Wrong Answer__**', 'You clicked the wrong button. You have been quarantined.\nContact a server admin to appeal.');
module.exports.tooFast = (ms) => reply(0xFF0000, '<:protected:1550516426530488443> **__Bot Detected__**', `Response too fast (${ms}ms). You have been quarantined.`);
module.exports.honeypot = () => reply(0xFF0000, '<:ban:1550513842990088233> **__Honeypot Triggered__**', 'You have been banned.');
module.exports.timeout = () => reply(0x888888, '<:pending:1551656840817938472> **__Timed Out__**', 'You did not verify in time. You have been quarantined.\nContact a server admin to appeal.');
module.exports.noSession = () => reply(0x888888, '<:pending:1551656840817938472> **__Session Expired__**', 'Your verification session expired. Please rejoin the server.');
module.exports.memberMissing = () => reply(0x888888, '<:error:1551980017800712295> **__Member Unavailable__**', 'Your server membership could not be found.');
module.exports.vpnDetected = () => reply(0x9B59B6, '<:protected:1550516426530488443> **__VPN/Proxy Detected__**', 'Please disable your VPN or proxy and rejoin.');
module.exports.manuallyApproved = () => reply(0x00FF88, '<:success:1550511021146247239> **__Verification Approved__**', 'A server administrator manually approved your verification.');
module.exports.guildOnly = () => reply(0xFF0000, '<:error:1551980017800712295> **__Server Only__**', 'This Axex interaction can only be used inside a server.');
module.exports.notConfigured = () => reply(0xFFA500, '<:suspicious:1550515702006554774> **__Axex Not Configured__**', 'Axex verification is not configured for this server.');
module.exports.alreadyVerified = () => reply(0x00FF88, '<:verified:1550465125440430191> **__Already Verified__**', 'You are already verified!');
module.exports.sessionAlreadyActive = () => reply(0xFFA500, '<:pending:1551656840817938472> **__Verification In Progress__**', 'You already have an active verification session. Please complete it.');
