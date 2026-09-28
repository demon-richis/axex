const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports.permanentPanel = (guildName) => ({
  embeds: [new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setDescription(
      ` **__Verification Required__**\n\n` +
      `<:user:1550520335919481002> To access \`${guildName}\`, you must verify first.\n` +
      `> Click the **Verify** button below to start.`
    )
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('axex_verify_start')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success)
    )
  ]
});