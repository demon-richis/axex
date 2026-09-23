const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const E = {
  user: "<:user:1550520335919481002>",
  verify: "<:verify:1551154167727398993>",
};

client.once("ready", async () => {
  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    if (!channel?.isTextBased() || !channel.guild) {
      throw new Error("CHANNEL_ID must be a server text channel.");
    }

    // Live server name
    const $server_name = channel.guild.name;

    const panel = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setDescription(
        `<:verify:1551154167727398993> **__Verification Required__**\n\n` +
        `${E.user} To access \`${$server_name}\`, you must verify first.\n` +
        `> Click the **Verify** button below to start.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("axex_verify_start")
        .setLabel("Verify")
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      embeds: [panel],
      components: [row],
    });

    console.log(`✓ Panel sent to ${$server_name}`);
  } catch (error) {
    console.error("✗ Failed to send panel:", error);
  }

  process.exit(0);
});

if (!process.env.BOT_TOKEN || !process.env.CHANNEL_ID) {
  console.error("BOT_TOKEN or CHANNEL_ID is missing in .env");
  process.exit(1);
}

client.login(process.env.BOT_TOKEN);