const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports.normal = (member, letter, timeoutSeconds, row) => ({
  embeds: [new EmbedBuilder()
    .setColor(0x00FF88)
    .setDescription(
      `**__Verification Required__**\n\n` +
      `<:user:1550520335919481002> To access \`${member.guild.name}\`, you must verify first.\n` +
      `> Click button **${letter}** to verify.\n` +
      `> <:pending:1551656840817938472> You have **${timeoutSeconds} seconds**.`
    )
  ],
  components: row ? [row] : []
});

module.exports.newAccount = (member, letter, timeoutSeconds, days, row) => ({
  embeds: [new EmbedBuilder()
    .setColor(0xFFA500)
    .setDescription(
      ` **__Verification Required__**\n\n` +
      `<:user:1550520335919481002> To access \`${member.guild.name}\`, you must verify first.\n` +
      `> <:suspicious:1550515702006554774> Your account is **${days} day(s) old**.\n` +
      `> Click button **${letter}** to verify.\n` +
      `> <:pending:1551656840817938472> You have **${timeoutSeconds} seconds**.`
    )
  ],
  components: row ? [row] : []
});

module.exports.raidMode = (member, letter, timeoutSeconds, row) => ({
  embeds: [new EmbedBuilder()
    .setColor(0xFF0000)
    .setDescription(
      ` **__Verification Required__**\n\n` +
      `<:user:1550520335919481002> To access \`${member.guild.name}\`, you must verify first.\n` +
      `> <:protected:1550516426530488443> **Raid protection active** — strict verification.\n` +
      `> Click button **${letter}** to verify.\n` +
      `> <:pending:1551656840817938472> You have **${timeoutSeconds} seconds**.`
    )
  ],
  components: row ? [row] : []
});

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

module.exports.challengeButtons = (letters, ids) => ({
  row: new ActionRowBuilder().addComponents(
    letters.map((letter, index) =>
      new ButtonBuilder()
        .setCustomId(ids[index])
        .setLabel(letter)
        .setStyle(ButtonStyle.Secondary)
    )
  )
});

module.exports.fallbackChallenge = (userId, embed, row) => ({
  content: `<@${userId}>`,
  embeds: [embed],
  components: [row]
});