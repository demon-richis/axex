const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const E = require('../../verification/emojis');

const ID_VERIFY = 'axex_verify_start';
const ID_HELP = 'axex_help';

function buildPanel(guildName) {
  const embed = new EmbedBuilder()
    .setColor(0x676669)
    .setDescription(
      `### ${E.captcha} Verification Required!\n` +
        `${E.reminder} To access **${guildName}**, you need to pass verification first.\n` +
        `${E.invisible} ${E.arrow} Press **Verify** below to start.`,
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ID_VERIFY)
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ID_HELP)
      .setLabel('Help')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  buildPanel,
  permanentPanel: buildPanel,
};
