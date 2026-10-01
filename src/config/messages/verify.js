const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const E = {
  verify: '<:verify:1551154167727398993>',
  user: '<:user:1550520335919481002>',
  protected: '<:protected:1550516426530488443>',
  pending: '<:pending:1551656840817938472>',
  success: '<:success:155051102114627239>',
};

module.exports.permanentPanel = (guildName) => ({
  embeds: [new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(
      `${E.verify} **Axex verification required**\n\n` +
      `Welcome to **${guildName}**. Complete the secure verification below to unlock the server.\n\n` +
      `> ${E.user} **What happens:** Discord identity check + security challenge\n` +
      `> ${E.protected} **Protection:** VPN/proxy and suspicious activity checks\n` +
      `> ${E.pending} **Time:** Usually less than two minutes\n\n` +
      `-# You have up to 3 attempts. Follow the instructions carefully.`
    )
    .setTimestamp()],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('axex_verify_start')
        .setLabel('Start verification')
        .setEmoji('1551154167727398993')
        .setStyle(ButtonStyle.Primary),
    ),
  ],
});
